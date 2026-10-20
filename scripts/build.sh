#!/bin/sh
# Package addon/ into build/auto-sort-<version>.xpi
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p 'require("./addon/manifest.json").version')
mkdir -p build
OUT="build/auto-sort-$VERSION.xpi"
rm -f "$OUT"
(cd addon && zip -qr "../$OUT" . -x '.*')
echo "$OUT"
