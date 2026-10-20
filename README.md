**English** | [简体中文](README.zh-CN.md)

# Auto Sort — automatic categorization for Zotero

Auto Sort scans your library (or one collection) and suggests topic categories, computed entirely on your machine. Check the ones you want, and it creates subcollections under an `Auto-Sorted` parent collection and files the items into them. Your existing collections are never changed. Zotero collections only hold references, so attachments are not duplicated.

Works with Zotero 7–10 (tested on Zotero 10.0.6). The interface is available in English and Chinese.

## Usage

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
    dialog.xhtml/js/css  dialog UI
scripts/
  build.sh             packages build/auto-sort-<version>.xpi
  try-classifier.js    tests the algorithm in Node on exported data
```

Build:

```bash
./scripts/build.sh
```

Install: Zotero → Tools → Plugins → gear icon → Install Add-on From File… → choose `build/auto-sort-*.xpi`.

**Adding a language:** add a block with the same keys to `STRINGS` in `addon/content/i18n.js`, add its name to `LANGUAGE_NAMES`, add an `<option>` to the language menu in `dialog.xhtml`, and extend `resolve()` so "Follow Zotero" can pick it.

**Testing the algorithm without Zotero:** export `[{id, lib, title, abstract, tags: "a|b"}]` JSON from a copy of `zotero.sqlite`, then run:

```bash
node scripts/try-classifier.js items.json 1
```

**Self-test:** if Zotero is started with the environment variable `AUTOSORT_SELFTEST=1`, the plugin scans the library, creates test collections, drives the dialog in both languages, and quits. Set `AUTOSORT_SNAPSHOT=/path.png` to also save screenshots of the dialog. **Only do this with a test profile and a copy of your data.**

The `update_url` in `manifest.json` is a placeholder; replace it with your own before publishing.
