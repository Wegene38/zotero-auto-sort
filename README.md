**English** | [简体中文](README.zh-CN.md)

# Auto Sort — automatic categorization for Zotero

Auto Sort scans your library (or one collection) and suggests topic categories, computed entirely on your machine. Check the ones you want, and it creates subcollections under an `Auto-Sorted` parent collection and files the items into them. Your existing collections are never changed. Zotero collections only hold references, so attachments are not duplicated.

Works with Zotero 7–10 (tested on Zotero 10.0.6). The interface is available in English and Chinese.

## Download and install

**[⬇ Download the latest release](https://github.com/Wegene38/zotero-auto-sort/releases/latest)** (current version: [v0.1.0](https://github.com/Wegene38/zotero-auto-sort/releases/tag/v0.1.0))

1. On the release page, download `auto-sort-<version>.xpi` from **Assets**. In Firefox, right-click the file and choose **Save Link As…**, because clicking it makes Firefox try to install it as a Firefox add-on.
2. In Zotero, open **Tools → Plugins**.
3. Click the gear icon in the top-right corner, choose **Install Add-on From File…**, and select the downloaded `.xpi` file.
4. The toolbar button (three stacked folders) appears above the item list. No restart is needed.

Requires Zotero 7 or later (tested on Zotero 10.0.6). Once installed, Zotero updates the plugin automatically when a new version is released.

## Usage

- **Toolbar button** (three stacked folders, right after "New Note" above the item list) scans the selected collection, or the whole library if a library is selected.
- **Tools → Auto Sort Library…** scans the whole library that is currently selected.
- **Right-click a collection → Auto Sort Items Here…** scans only that collection, optionally including its subcollections.

In the dialog you can:

- Change the number of categories or toggle "Allow an item in multiple categories", then click **Regenerate**
- Check the categories to create, rename them in place, and click **Preview** to see their items (clicking a title shows it in Zotero)
- Change the parent collection name (default `Auto-Sorted`)
- Switch the interface language from the menu in the top-right corner (Follow Zotero / English / 中文). Your choice is remembered.

Running it again is safe: parent and subcollections with the same name are reused, and items already in them are not added twice.

## How it works (local only, no network)

`addon/content/classifier.js`:

1. Extracts words and adjacent word pairs from titles (weight ×3), abstracts (×1) and tags (×3). English text gets stopword filtering and light stemming; Chinese text is split into character bigrams. HTML tags, PDF-filename-style titles and web page title suffixes are cleaned up.
2. Builds TF-IDF vectors and clusters them with spherical k-means (k-means++ seeding, fixed random seed, best of 3 restarts). The default k is ≈ √(n/5), clamped to 2–30.
3. Names each cluster after terms that are common inside it but rare in the rest of the library, preferring phrases and tags.
4. Multi-membership: an item also joins another cluster if its similarity to that cluster's center is at least 85% of its best similarity.

Clustering 2231 items takes under a second.

## Development

```
addon/
  manifest.json        plugin metadata
  bootstrap.js         lifecycle: registers chrome, loads scripts
  content/
    autosort.js        menus, reading items, creating collections, language preference
    classifier.js      categorization algorithm (no Zotero dependency, runs in Node)
    i18n.js            English and Chinese UI strings
    toolbar-icon.svg   toolbar button icon (follows the light/dark theme)
    dialog.xhtml/js/css  dialog UI
scripts/
  build.sh             packages build/auto-sort-<version>.xpi
  try-classifier.js    tests the algorithm in Node on exported data
```

Build:

```bash
./scripts/build.sh
```

To install a local build, follow the steps in [Download and install](#download-and-install) and choose `build/auto-sort-*.xpi`.

**Adding a language:** add a block with the same keys to `STRINGS` in `addon/content/i18n.js`, add its name to `LANGUAGE_NAMES`, add an `<option>` to the language menu in `dialog.xhtml`, and extend `resolve()` so "Follow Zotero" can pick it.

**Testing the algorithm without Zotero:** export `[{id, lib, title, abstract, tags: "a|b"}]` JSON from a copy of `zotero.sqlite`, then run:

```bash
node scripts/try-classifier.js items.json 1
```

**Self-test:** if Zotero is started with the environment variable `AUTOSORT_SELFTEST=1`, the plugin scans the library, creates test collections, drives the dialog in both languages, and quits. Set `AUTOSORT_SNAPSHOT=/path.png` to also save screenshots of the dialog. **Only do this with a test profile and a copy of your data.**

## License

Copyright (c) 2026 Wegene38. All rights reserved except as granted by the license.

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). You may use, modify and share this plugin for **noncommercial purposes only**, such as personal study, academic research, and use by charities, educational institutions and government bodies. **Any commercial use is prohibited** without written permission from the author. Redistributions must include the license and the `Required Notice` line.
