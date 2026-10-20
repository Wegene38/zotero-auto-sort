/* UI strings in English and Chinese. Loaded both in the plugin scope and in the dialog window.
 * Placeholders: {name} inserts args.name; {n:item|items} picks singular/plural by args.n. */

var AutoSortI18n = (function () {
  "use strict";

  const STRINGS = {
    en: {
      "title": "Auto Sort",
      "menu.tools": "Auto Sort Library…",
      "menu.collection": "Auto Sort Items Here…",
      "toolbar.tooltip": "Auto Sort: suggest categories for the current library or collection",
      "readonly": "This library is read-only, so collections can't be created.",
      "scope.library": "Scope: library “{name}”",
      "scope.collection": "Scope: collection “{name}”",
      "language": "Language",
      "lang.auto": "Follow Zotero",
      "k.label": "Categories",
      "k.auto": "Auto",
      "k.autoN": "Auto ({n})",
      "multi": "Allow an item in multiple categories",
      "subs": "Include items in subcollections",
      "rescan": "Regenerate",
      "selectAll": "Select all",
      "selectNone": "Select none",
      "hint": "Check the categories to create. Names are editable; click “Preview” to see the items.",
      "parent": "Parent collection",
      "cancel": "Cancel",
      "close": "Close",
      "apply": "Create collections",
      "status.scanning": "Scanning items…",
      "progress.terms": "Extracting keywords…",
      "progress.cluster": "Clustering ({i}/{n})…",
      "status.none": "{total} {total:item|items}: too few, or missing titles and abstracts, to suggest categories.",
      "status.result": "{total} {total:item|items}, {n} suggested {n:category|categories}.",
      "status.unclassified": " {n} {n:item|items} without a title or abstract {n:was|were} skipped.",
      "status.scanFailed": "Scan failed: {error}",
      "count": "{n} {n:item|items}",
      "count.extra": "{n} also in other categories",
      "preview": "Preview",
      "collapse": "Hide",
      "preview.secondary": "(also in other categories) ",
      "preview.locate": "Click to show in Zotero: {title}",
      "preview.more": "…and {n} more",
      "untitled": "(untitled)",
      "summary": "{n} {n:category|categories}, {items} {items:item|items} selected (existing collections are untouched)",
      "dupName": "Duplicate category name “{name}”. Rename it before creating.",
      "status.creating": "Creating collections…",
      "status.creatingN": "Creating collections… ({done}/{total})",
      "status.done": "Done: created {created} {created:subcollection|subcollections} under “{parent}” and filed {added} {added:item|items}.",
      "status.applyFailed": "Failed to create collections: {error}",
    },
    zh: {
      "title": "自动分类文献",
      "menu.tools": "自动分类文献…",
      "menu.collection": "自动分类此处文献…",
      "toolbar.tooltip": "自动分类：为当前文库或分类推荐分类",
      "readonly": "当前文库是只读的，无法创建分类。",
      "scope.library": "扫描范围：文库「{name}」",
      "scope.collection": "扫描范围：分类「{name}」",
      "language": "语言",
      "lang.auto": "跟随 Zotero",
      "k.label": "分类数量",
      "k.auto": "自动",
      "k.autoN": "自动 ({n})",
      "multi": "允许一篇文献属于多个分类",
      "subs": "包含子分类中的文献",
      "rescan": "重新生成",
      "selectAll": "全选",
      "selectNone": "全不选",
      "hint": "勾选要创建的分类，名称可以直接修改；点“预览”查看包含的文献。",
      "parent": "放入父分类",
      "cancel": "取消",
      "close": "关闭",
      "apply": "创建分类",
      "status.scanning": "正在扫描文献…",
      "progress.terms": "提取关键词…",
      "progress.cluster": "聚类中（{i}/{n}）…",
      "status.none": "共 {total} 篇文献，数量太少或缺少标题/摘要，无法生成分类。",
      "status.result": "共 {total} 篇文献，生成 {n} 个候选分类。",
      "status.unclassified": "另有 {n} 篇因缺少标题和摘要未参与分类。",
      "status.scanFailed": "扫描失败：{error}",
      "count": "{n} 篇",
      "count.extra": "{n} 篇同时属于其他分类",
      "preview": "预览",
      "collapse": "收起",
      "preview.secondary": "（也属于其他分类）",
      "preview.locate": "点击在 Zotero 中定位：{title}",
      "preview.more": "……还有 {n} 篇",
      "untitled": "(无标题)",
      "summary": "已选 {n} 个分类，共 {items} 篇文献（原有分类不受影响）",
      "dupName": "分类名称重复：「{name}」，请修改后再创建。",
      "status.creating": "正在创建分类…",
      "status.creatingN": "正在创建分类…（{done}/{total}）",
      "status.done": "完成：在「{parent}」下新建 {created} 个子分类，新增 {added} 条文献归类。",
      "status.applyFailed": "创建失败：{error}",
    },
  };

  // Shown in the language menu in their own language, regardless of the current UI language.
  const LANGUAGE_NAMES = { en: "English", zh: "中文" };

  /** pref: "auto" | "en" | "zh"; zoteroLocale: e.g. "zh-CN" */
  function resolve(pref, zoteroLocale) {
    if (STRINGS[pref]) return pref;
    return /^zh/i.test(zoteroLocale || "") ? "zh" : "en";
  }

  function t(lang, key, args) {
    const s = (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.en[key] ?? key;
    if (!args) return s;
    return s.replace(/\{(\w+)(?::([^|}]*)\|([^}]*))?\}/g, (m, name, one, many) => {
      if (one === undefined) return name in args ? String(args[name]) : m;
      return Number(args[name]) === 1 ? one : many;
    });
  }

  return { STRINGS, LANGUAGE_NAMES, resolve, t };
})();

if (typeof module !== "undefined") module.exports = AutoSortI18n;
