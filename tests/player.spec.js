const { test, expect } = require('@playwright/test')

/** One second of silence as WAV — a real playable audio file. */
function wav(seconds = 1, rate = 8000) {
  const n = seconds * rate, b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  return b
}
const file = (name) => ({ name, mimeType: 'audio/wav', buffer: wav() })
const answers = [] // replies for prompt()/confirm(), in order
test.beforeEach(async ({ page }) => {
  answers.length = 0
  page.on('dialog', (d) => d.accept(answers.shift() ?? ''))
  await page.goto('./')
})
async function addFiles(page, names) {
  await page.locator('#add').click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Аудиофайлы…' }).click()
  await (await chooser).setFiles(names.map(file))
  await expect(page.locator('#toast')).toHaveText(`Добавлено: ${names.length}`)
}
async function newDir(page, name) { answers.push(name); await page.locator('#newdir').click() }
const rows = (page) => page.locator('#list li .name b')

test('empty library explains what to do', async ({ page }) => {
  await expect(page.locator('.empty')).toContainText('Нажмите +')
  await expect(page.locator('#player')).toBeHidden()
})

test('add files, play, next/prev, and it survives a reload', async ({ page }) => {
  await addFiles(page, ['10 Ten.wav', '2 Two.wav', '1 One.wav'])
  await expect(rows(page)).toHaveText(['1 One', '2 Two', '10 Ten']) // natural sort
  await page.getByText('2 Two').click()
  await expect(page.locator('#title')).toHaveText('2 Two')
  await expect(page.locator('#sub')).toHaveText('Музыка · 2 из 3')
  await expect.poll(() => page.evaluate(() => document.getElementById('audio').currentTime)).toBeGreaterThan(0.2)
  await expect(page.locator('#play')).toHaveText('⏸')
  await page.locator('#next').click()
  await expect(page.locator('#title')).toHaveText('10 Ten')
  await expect(page.locator('li.playing')).toHaveText(/10 Ten/)
  await page.locator('#prev').click()
  await expect(page.locator('#title')).toHaveText('2 Two')
  await page.reload()
  await expect(rows(page)).toHaveCount(3)
  await expect(page.locator('#title')).toHaveText('2 Two')
  await expect(page.locator('#play')).toHaveText('▶')
})

test('subfolders: create, add into, navigate, play all recursively', async ({ page }) => {
  await addFiles(page, ['root.wav'])
  await newDir(page, 'Rock')
  await page.getByText('Rock').click()
  await expect(page.locator('#crumbs')).toContainText('Rock')
  await addFiles(page, ['a.wav'])
  await newDir(page, 'Live')
  await page.getByText('Live').click()
  await addFiles(page, ['b.wav'])
  await page.locator('#crumbs button', { hasText: 'Музыка' }).click()
  await expect(rows(page)).toHaveText(['Rock', 'root'])
  await page.getByText('Играть всё, с подпапками (3)').click()
  await expect(page.locator('#sub')).toHaveText(/1 из 3/)
})

test('rename and delete', async ({ page }) => {
  await addFiles(page, ['old.wav'])
  await newDir(page, 'Dir')
  await page.locator('li', { hasText: 'old' }).locator('.more').click()
  answers.push('new')
  await page.getByRole('button', { name: 'Переименовать' }).click()
  await expect(rows(page)).toHaveText(['Dir', 'new'])
  await page.locator('li', { hasText: 'Dir' }).locator('.more').click()
  answers.push('')
  await page.getByRole('button', { name: 'Удалить' }).click()
  await expect(rows(page)).toHaveText(['new'])
})

test('shuffle and repeat toggle', async ({ page }) => {
  await addFiles(page, ['a.wav', 'b.wav'])
  await page.getByText('a', { exact: true }).click()
  await page.locator('#shuffle').click()
  await expect(page.locator('#shuffle')).toHaveClass(/on/)
  await page.locator('#repeat').click()
  await page.locator('#repeat').click()
  await expect(page.locator('#repeat')).toHaveClass(/one/)
})

test('everything fits the screen width', async ({ page }) => {
  await addFiles(page, ['A very very long track name that should be truncated nicely.wav'])
  await page.locator('li .name').first().click()
  const w = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(w).toBeLessThanOrEqual(page.viewportSize().width)
  for (const id of ['#add', '#newdir', '#play', '#prev', '#next', '#shuffle', '#repeat']) await expect(page.locator(id)).toBeInViewport()
})
