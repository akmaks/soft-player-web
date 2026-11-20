---
name: run-tests
description: Как прогнать уже написанные UI-тесты soft-player-web (Playwright, WebKit) и отчитаться. Используется агентом test-runner. НЕ для написания и починки тестов и НЕ для деплоя.
---

# Прогон тестов soft-player-web

Запускает, собирает факты, отчитывается. Не правит файлы, не чинит, не гадает.

```sh
npm test 2>&1 | grep -E "✘|passed|failed|flaky|Error:|^\s+>\s+[0-9]+"
```
Зелёный — все тесты прошли на обоих проектах: «iPhone 13 mini» и «iPhone 320 (Display Zoom)».
Никогда не запускать `npm run deploy`.

## Если тест упал
1. Сообщение и строка — в выводе (`Error:` и строка с `>`).
2. Снимок страницы: `test-results/<тест>-<проект>/error-context.md` — приложи кусок вокруг элементов из ошибки.
3. Перезапусти только этот тест один раз: `npx playwright test --project="<проект>" -g "<название>"`.
   Прошёл со второго раза — пометь «нестабилен».

## Если не стартовало
`node --version`, `npx playwright --version`, занят ли порт 8099. Нет браузера — сообщить про `npx playwright install webkit`, самому не ставить.

## Отчёт
```
ui: ❌ 11/12 — iPhone 320: «everything fits the screen width» упал
   tests/player.spec.js:98 expect(received).toBeLessThanOrEqual(320) — received 336
   повтор: упал снова
```
Числа — из вывода, не придумывать.
