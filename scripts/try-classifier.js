// Run the classifier on exported items outside Zotero.
// Usage: node scripts/try-classifier.js items.json [libraryID] [k]
// items.json: [{id, lib, title, abstract, tags: "a|b"}] (see README for the export query)
const fs = require("fs");
const path = require("path");
const C = require(path.join(__dirname, "../addon/content/classifier.js"));

const [file, lib = "1", k = "0"] = process.argv.slice(2);
const items = JSON.parse(fs.readFileSync(file, "utf8"))
  .filter((x) => String(x.lib) === lib)
  .map((x) => ({ id: x.id, title: x.title || "", abstract: x.abstract || "", tags: x.tags ? x.tags.split("|") : [] }));
const byId = new Map(items.map((x) => [x.id, x]));

(async () => {
  const t0 = Date.now();
  const res = await C.classify(items, { k: Number(k) });
  console.log(`${items.length} items -> k=${res.k}, ${res.unclassified.length} unclassified, ${Date.now() - t0} ms\n`);
  for (const c of res.clusters) {
    console.log(`■ ${c.name}  [${c.primaryCount} + ${c.itemIDs.length - c.primaryCount} extra, cohesion ${c.cohesion.toFixed(2)}]`);
    console.log(`  keywords: ${c.keywords.join(", ")}`);
    for (const id of c.itemIDs.slice(0, 3)) console.log(`   - ${C.cleanTitle(byId.get(id).title).slice(0, 100)}`);
  }
})();
