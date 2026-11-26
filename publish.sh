#!/usr/bin/env bash
# Publishes the till to GitHub Pages (repo MohamedAliSalam/apron-till), served at
# https://apron.mohamedalisalam.com. Uses the personal GitHub login, like the portfolio.
# After changing app.js or index.html, bump CACHE in sw.js so tablets pick up the update.
set -euo pipefail
cd "$(dirname "$0")"
TOKEN="$(gh auth token --user MohamedAliSalam)"
git add -A
git diff --cached --quiet || git -c user.name="MohamedAliSalam" -c user.email="102904729+MohamedAliSalam@users.noreply.github.com" commit -q -m "Update till ($(date +%Y-%m-%d))"
git push -q "https://x-access-token:${TOKEN}@github.com/MohamedAliSalam/apron-till.git" HEAD:main
echo "Published to https://apron.mohamedalisalam.com (updates within a minute or two)."
