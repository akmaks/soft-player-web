'use strict'
// Audio files live in IndexedDB, keyed by path: "Rock/Album/01 Song.mp3".
// iOS Safari cannot keep access to a folder in the Files app, so the app keeps its own folder tree.
// Store "files": path -> { type, data: ArrayBuffer } (not a Blob: WebKit in private mode cannot store Blobs). Store "dirs": path -> true (so empty folders survive).

const $ = (id) => document.getElementById(id)
const audio = $('audio')
const AUDIO_EXT = { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
  aif: 'audio/aiff', aiff: 'audio/aiff', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', caf: 'audio/x-caf' }

// ---------- storage ----------
let dbp
function db() {
  return (dbp ??= new Promise((ok, fail) => {
    const r = indexedDB.open('player', 1)
    r.onupgradeneeded = () => { r.result.createObjectStore('files'); r.result.createObjectStore('dirs') }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => fail(r.error)
  }))
}
async function tx(stores, mode, fn) {
  const d = await db()
  return new Promise((ok, fail) => {
    const t = d.transaction(stores, mode)
    const res = fn(...[].concat(stores).map((s) => t.objectStore(s)))
    t.oncomplete = () => ok(res && 'result' in res ? res.result : res)
    t.onerror = t.onabort = () => fail(t.error)
  })
}
const allKeys = (store) => tx(store, 'readonly', (s) => s.getAllKeys())
const getBlob = async (path) => {
  const v = await tx('files', 'readonly', (s) => s.get(path))
  return v && new Blob([v.data], { type: v.type })
}
const putFile = (path, type, data) => tx('files', 'readwrite', (s) => s.put({ type, data }, path))
const putDir = (path) => tx('dirs', 'readwrite', (s) => s.put(true, path))

const under = (prefix) => IDBKeyRange.bound(prefix + '/', prefix + '/￿')
const join = (dir, name) => (dir ? dir + '/' + name : name)
const parent = (p) => p.slice(0, Math.max(0, p.lastIndexOf('/')))
const base = (p) => p.slice(p.lastIndexOf('/') + 1)
const stem = (p) => base(p).replace(/\.[^.]+$/, '')
const ext = (p) => (/\.([^./]+)$/.exec(p)?.[1] ?? '').toLowerCase()
const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' })
const byName = (a, b) => collator.compare(base(a), base(b))

async function removePath(path, isDir) {
  await tx(['files', 'dirs'], 'readwrite', (f, d) => {
    if (isDir) { f.delete(under(path)); d.delete(under(path)); d.delete(path) } else f.delete(path)
  })
}
async function renamePath(path, isDir, newName) {
  const to = join(parent(path), newName)
  await tx(['files', 'dirs'], 'readwrite', (f, d) => {
    const move = (store, range, fix) => {
      store.openCursor(range).onsuccess = (e) => {
        const c = e.target.result
        if (!c) return
        store.put(c.value, fix(c.key)); c.delete(); c.continue()
      }
    }
    if (isDir) {
      const fix = (k) => to + k.slice(path.length)
      move(f, under(path), fix); move(d, under(path), fix); move(d, path, fix)
    } else move(f, path, () => to)
  })
  return to
}

// ---------- library view ----------
let cwd = localStorage.cwd || ''
let tree = { files: [], dirs: new Set() }

async function load() {
  const files = await allKeys('files')
  const dirs = new Set(await allKeys('dirs'))
  for (const f of files) for (let p = parent(f); p; p = parent(p)) dirs.add(p)
  tree = { files, dirs }
  if (cwd && !dirs.has(cwd)) cwd = ''
  render()
}
const filesIn = (dir) => tree.files.filter((f) => parent(f) === dir).sort(byName)
const filesUnder = (dir) => tree.files.filter((f) => !dir || f.startsWith(dir + '/')).sort((a, b) => collator.compare(a, b))
const dirsIn = (dir) => [...tree.dirs].filter((d) => parent(d) === dir).sort(byName)

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props)
  e.append(...kids)
  return e
}

function render() {
  localStorage.cwd = cwd
  const crumbs = $('crumbs')
  crumbs.replaceChildren(el('button', { textContent: 'Музыка', onclick: () => go('') }))
  let acc = ''
  for (const part of cwd ? cwd.split('/') : []) {
    const p = (acc = join(acc, part))
    crumbs.append(el('span', { textContent: '›' }), el('button', { textContent: part, onclick: () => go(p) }))
  }
  crumbs.scrollLeft = crumbs.scrollWidth

  const dirs = dirsIn(cwd), files = filesIn(cwd), deep = filesUnder(cwd)
  const list = $('list')
  list.replaceChildren()
  if (!dirs.length && !files.length) {
    list.append(el('div', { className: 'empty', textContent: cwd ? 'Папка пуста. Нажмите + чтобы добавить аудио.'
      : 'Здесь пока пусто. Нажмите + и выберите аудиофайлы — они скопируются в плеер.' }))
    return
  }
  if (deep.length > files.length) {
    list.append(el('button', { className: 'playall', textContent: `▶  Играть всё, с подпапками (${deep.length})`,
      onclick: () => playQueue(deep, 0) }))
  }
  const ul = el('ul')
  for (const d of dirs) ul.append(row('dir', d, '📁', () => go(d)))
  files.forEach((f, i) => ul.append(row('file', f, '♪', () => playQueue(files, i))))
  list.append(ul)
}
function row(kind, path, icon, onOpen) {
  const li = el('li', { className: kind },
    el('button', { className: 'name', onclick: onOpen }, el('span', { className: 'ico', textContent: icon }),
      el('b', { textContent: kind === 'dir' ? base(path) : stem(path) })),
    el('button', { className: 'more', textContent: '⋯', ariaLabel: 'Действия', onclick: () => itemMenu(kind, path) }))
  li.dataset.path = path
  if (kind === 'file' && path === current()) li.classList.add('playing')
  return li
}
function go(dir) { cwd = dir; render(); $('list').parentElement.scrollTop = 0 }

// ---------- menus ----------
function menu(title, items) {
  const m = $('menu')
  m.replaceChildren(el('h3', { textContent: title }))
  for (const [label, fn, cls] of [...items, ['Отмена', null, 'cancel']]) {
    m.append(el('button', { textContent: label, className: cls || '', onclick: () => { m.close(); fn?.() } }))
  }
  m.onclick = (e) => { if (e.target === m) m.close() }
  m.showModal()
}
function itemMenu(kind, path) {
  const isDir = kind === 'dir'
  menu(isDir ? base(path) : stem(path), [
    ['Переименовать', async () => {
      const old = base(path)
      const name = prompt('Новое имя', isDir ? old : stem(old))?.trim().replace(/\//g, '-')
      if (!name) return
      const full = isDir || !ext(old) ? name : `${name}.${ext(old)}`
      if (full === old) return
      if (tree.files.includes(join(cwd, full)) || tree.dirs.has(join(cwd, full))) return toast('Такое имя уже есть')
      const to = await renamePath(path, isDir, full)
      const fix = (p) => (p === path || p.startsWith(path + '/') ? to + p.slice(path.length) : p)
      state.queue = state.queue.map(fix); save()
      await load(); showTrack()
    }],
    ['Удалить', async () => {
      const n = isDir ? filesUnder(path).length : 1
      if (!confirm(isDir ? `Удалить папку «${base(path)}» и всё в ней (${n} файл.)?` : `Удалить «${stem(path)}»?`)) return
      const cur = current()
      await removePath(path, isDir)
      if (cur && (cur === path || cur.startsWith(path + '/'))) stop()
      await load()
    }, 'danger'],
  ])
}

$('newdir').onclick = async () => {
  const name = prompt('Название новой папки')?.trim().replace(/\//g, '-')
  if (!name) return
  const p = join(cwd, name)
  if (tree.dirs.has(p)) return toast('Такая папка уже есть')
  await putDir(p)
  await load()
}

$('add').onclick = () => menu(`Добавить в «${cwd ? base(cwd) : 'Музыка'}»`, [
  ['Аудиофайлы…', () => $('files').click()],
  ['Папку целиком (с подпапками)…', () => $('folder').click()],
])
$('files').onchange = (e) => importFiles(e.target)
$('folder').onchange = (e) => importFiles(e.target)

async function importFiles(input) {
  const list = [...input.files].filter((f) => f.type.startsWith('audio/') || AUDIO_EXT[ext(f.name)])
  input.value = ''
  if (!list.length) return toast('Аудиофайлов не найдено')
  navigator.storage?.persist?.()
  const into = cwd
  let done = 0
  for (const f of list) {
    toast(`Копирую ${++done} из ${list.length}…`, true)
    const rel = (f.webkitRelativePath || f.name).replace(/^\/+/, '')
    const type = AUDIO_EXT[ext(f.name)] || f.type || 'audio/mpeg'
    try {
      // Copy the bytes: a File from the picker can go stale once iOS drops its temporary copy.
      await putFile(join(into, rel), type, await f.arrayBuffer())
    } catch (err) {
      toast(`Не удалось сохранить «${f.name}»: ${err?.message || err}`)
      await load()
      return
    }
  }
  await load()
  toast(`Добавлено: ${list.length}`)
}

let toastTimer
function toast(text, sticky) {
  const t = $('toast')
  t.textContent = text
  t.classList.add('show')
  clearTimeout(toastTimer)
  if (!sticky) toastTimer = setTimeout(() => t.classList.remove('show'), 2500)
}

// ---------- player ----------
// order: indexes into queue in play order (shuffled or not); pos: where we are in order.
const state = Object.assign({ queue: [], order: [], pos: 0, time: 0, shuffle: false, repeat: 'off' },
  JSON.parse(localStorage.player || '{}'))
const save = () => { localStorage.player = JSON.stringify({ ...state, time: audio.currentTime || state.time }) }
const current = () => state.queue[state.order[state.pos]]
let url

function makeOrder(first) {
  const idx = state.queue.map((_, i) => i)
  if (state.shuffle) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]] }
    idx.splice(idx.indexOf(first), 1); idx.unshift(first)
    state.pos = 0
  } else state.pos = first
  state.order = idx
}

function playQueue(files, i) {
  state.queue = [...files]
  makeOrder(i)
  start(true)
}

async function start(autoplay, at = 0) {
  const path = current()
  if (!path) return stop()
  const blob = await getBlob(path)
  if (!blob) { // removed meanwhile
    state.queue.splice(state.order[state.pos], 1); makeOrder(Math.min(state.order[state.pos] ?? 0, state.queue.length - 1))
    return state.queue.length ? start(autoplay) : stop()
  }
  if (url) URL.revokeObjectURL(url)
  audio.src = url = URL.createObjectURL(blob)
  if (at) audio.addEventListener('loadedmetadata', () => { audio.currentTime = at }, { once: true })
  if (autoplay) audio.play().catch(() => {})
  showTrack()
  save()
}

function stop() {
  audio.pause()
  audio.removeAttribute('src'); audio.load()
  state.queue = []; state.order = []; state.pos = 0; state.time = 0
  save(); showTrack()
}

function step(dir, auto) {
  const n = state.order.length
  if (!n) return
  if (auto && state.repeat === 'one') { audio.currentTime = 0; audio.play(); return }
  let p = state.pos + dir
  if (p >= n || p < 0) {
    if (state.repeat === 'off' && auto) { audio.currentTime = 0; audio.pause(); return }
    p = (p + n) % n
  }
  state.pos = p
  start(auto || !audio.paused)
}
function prev() { audio.currentTime > 3 ? (audio.currentTime = 0) : step(-1) }
function next() { step(1) }
function toggle() { audio.src ? (audio.paused ? audio.play() : audio.pause()) : start(true) }

function showTrack() {
  const path = current()
  $('player').classList.toggle('off', !path)
  for (const li of document.querySelectorAll('li.file')) li.classList.toggle('playing', li.dataset.path === path)
  $('shuffle').classList.toggle('on', state.shuffle)
  $('repeat').classList.toggle('on', state.repeat !== 'off')
  $('repeat').classList.toggle('one', state.repeat === 'one')
  if (!path) return
  const folder = parent(path)
  $('title').textContent = stem(path)
  $('sub').textContent = `${folder ? base(folder) : 'Музыка'} · ${state.pos + 1} из ${state.order.length}`
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: stem(path), artist: folder ? base(folder) : '',
      album: folder, artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] })
  }
}

const fmt = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00')
let dragging = false, lastSave = 0
audio.ontimeupdate = () => {
  if (!dragging) {
    $('cur').textContent = fmt(audio.currentTime)
    $('pos').value = audio.duration ? (audio.currentTime / audio.duration) * 1000 : 0
  }
  if (Date.now() - lastSave > 5000) { lastSave = Date.now(); save() }
}
audio.ondurationchange = () => { $('dur').textContent = fmt(audio.duration) }
audio.onplay = audio.onpause = () => {
  $('play').textContent = audio.paused ? '▶' : '⏸'
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing'
  save()
}
audio.onended = () => step(1, true)
$('pos').oninput = () => { dragging = true; $('cur').textContent = fmt(($('pos').value / 1000) * audio.duration) }
$('pos').onchange = () => { dragging = false; if (audio.duration) audio.currentTime = ($('pos').value / 1000) * audio.duration }
$('play').onclick = toggle
$('prev').onclick = prev
$('next').onclick = next
$('shuffle').onclick = () => {
  state.shuffle = !state.shuffle
  if (state.queue.length) makeOrder(state.order[state.pos])
  toast(state.shuffle ? 'Перемешивание включено' : 'Перемешивание выключено')
  showTrack(); save()
}
$('repeat').onclick = () => {
  state.repeat = { off: 'all', all: 'one', one: 'off' }[state.repeat]
  toast({ off: 'Повтор выключен', all: 'Повтор списка', one: 'Повтор трека' }[state.repeat])
  showTrack(); save()
}

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession
  const on = (a, fn) => { try { ms.setActionHandler(a, fn) } catch {} }
  on('play', () => (audio.src ? audio.play() : start(true)))
  on('pause', () => audio.pause())
  on('previoustrack', prev)
  on('nexttrack', next)
  on('seekto', (d) => { audio.currentTime = d.seekTime })
}
document.addEventListener('visibilitychange', () => { if (document.hidden) save() })

// ---------- boot ----------
load().then(() => { if (current()) start(false, state.time) })
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js')
// iOS ignores user-scalable=no: block pinch zoom ourselves (double-tap zoom is off via touch-action in CSS).
document.addEventListener('gesturestart', (e) => e.preventDefault())
