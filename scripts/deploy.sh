#!/bin/sh
# Publishes the app: pushes main to akmaks/soft-player-web (public), GitHub Pages serves it from main / root.
# Result: https://akmaks.github.io/soft-player-web/
set -eu
cd "$(dirname "$0")/.."
REPO=akmaks/soft-player-web

if [ -n "$(git status --porcelain)" ]; then echo "Есть незакоммиченные изменения — сначала коммит." >&2; exit 1; fi
if ! gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" --public --source . --remote origin --description "Simple audio player for iPhone (PWA)" >/dev/null
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$REPO.git"
git push -q -u origin main
gh api "repos/$REPO/pages" >/dev/null 2>&1 || gh api -X POST "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null
echo "Опубликовано: https://akmaks.github.io/soft-player-web/ (обновляется за 1–2 минуты)"
