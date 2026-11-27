#!/usr/bin/env bash
# Publishes the till to GitHub Pages (repo MohamedAliSalam/apron-till), served at
# https://apron.mohamedalisalam.com. Uses the personal GitHub login, like the portfolio.
# After changing app.js or index.html, bump CACHE in sw.js so tablets pick up the update.
set -euo pipefail
cd "$(dirname "$0")"
TOKEN="$(gh auth token --user MohamedAliSalam)"
# Stamp the page with the version from sw.js, so the page and its code always load as a matching pair.
V="$(grep -o 'apron-till-v[0-9]*' sw.js | grep -o '[0-9]*$')"
sed -i '' -E "s/(app\\.js|firebase-config\\.js)\\?v=[0-9]+/\\1?v=${V}/g" index.html
git add -A
git diff --cached --quiet || git -c user.name="MohamedAliSalam" -c user.email="102904729+MohamedAliSalam@users.noreply.github.com" commit -q -m "Update till ($(date +%Y-%m-%d))"
URL="https://x-access-token:${TOKEN}@github.com/MohamedAliSalam/apron-till.git"
# GitHub commits to the CNAME file itself when the custom domain is re-saved; pick those up first.
git fetch -q "$URL" main && git -c user.name="MohamedAliSalam" -c user.email="102904729+MohamedAliSalam@users.noreply.github.com" rebase -q FETCH_HEAD
git push -q "$URL" HEAD:main
echo "Published to https://apron.mohamedalisalam.com (updates within a minute or two)."
