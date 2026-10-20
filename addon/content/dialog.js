/* Dialog UI. All Zotero access goes through the `io` object passed by autosort.js. */
/* global AutoSortI18n */
"use strict";

const io = window.arguments[0].wrappedJSObject || window.arguments[0];
const HTML_NS = "http://www.w3.org/1999/xhtml";
const PREVIEW_LIMIT = 100;

const $ = (id) => document.getElementById(id);
let clusters = [];   // [{name, keywords, itemIDs, primaryCount, checked}]
let info = {};
let busy = false;
let finished = false;
let lang = AutoSortI18n.resolve(io.getLanguagePref(), io.zoteroLocale);
let status = { kind: "", parts: [] };   // kept as i18n keys so it can be re-rendered on language change

const t = (key, args) => AutoSortI18n.t(lang, key, args);

function h(tag, props, ...children) {
  const el = document.createElementNS(HTML_NS, tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c != null) el.append(c);
  return el;
}

/** setStatus(kind, [key, args], [key, args], ...) — parts are concatenated. */
function setStatus(kind, ...parts) {
  status = { kind: kind || "", parts };
  renderStatus();
}

function renderStatus() {
  const el = $("status");
  el.textContent = status.parts.map(([key, args]) => t(key, args)).join("");
  el.className = "status" + (status.kind ? " " + status.kind : "");
}

/** Fill every element marked with data-i18n / data-i18n-placeholder, plus a few dynamic labels. */
function applyStaticText() {
  document.title = t("title");
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  $("scope").textContent = t(io.isCollection ? "scope.collection" : "scope.library", { name: io.scopeName });
  $("cancel").textContent = t(finished ? "close" : "cancel");
  updateAutoPlaceholder();
}

function updateAutoPlaceholder() {
  $("k").placeholder = clusters.length ? t("k.autoN", { n: clusters.length }) : t("k.auto");
}

function setLanguage(pref) {
  io.setLanguagePref(pref);
  lang = AutoSortI18n.resolve(pref, io.zoteroLocale);
  applyStaticText();
  renderStatus();
  render();
}

function setBusy(b) {
  busy = b;
  for (const id of ["rescan", "k", "multi", "subs", "select-all", "select-none"]) $(id).disabled = b || finished;
  $("language").disabled = b;
  updateSummary();
}

async function scan() {
  setBusy(true);
  $("list").replaceChildren();
  setStatus("", ["status.scanning"]);
  try {
    const res = await io.scan({
      k: Number($("k").value) || 0,
      multiLabel: $("multi").checked,
      includeSubcollections: $("subs").checked,
      onProgress: (key, args) => setStatus("", [key, args]),
    });
    info = res.info;
    clusters = res.clusters.map((c) => ({
      name: c.name,
      keywords: Array.from(c.keywords),
      itemIDs: Array.from(c.itemIDs),
      primaryCount: c.primaryCount,
      checked: false,
    }));
    if (!clusters.length) {
      setStatus("error", ["status.none", { total: res.total }]);
    }
    else {
      const parts = [["status.result", { total: res.total, n: clusters.length }]];
      if (res.unclassified.length) parts.push(["status.unclassified", { n: res.unclassified.length }]);
      setStatus("", ...parts);
    }
    updateAutoPlaceholder();
    render();
  }
  catch (e) {
    setStatus("error", ["status.scanFailed", { error: String(e) }]);
    Components.utils.reportError(e);
  }
  finally {
    setBusy(false);
  }
}

function render() {
  const list = $("list");
  list.replaceChildren(...clusters.map((c, idx) => renderCluster(c, idx)));
  updateSummary();
}

function renderCluster(c, idx) {
  const li = h("li", { class: c.checked ? "checked" : "" });
  const checkbox = h("input", {
    type: "checkbox",
    checked: c.checked,
    disabled: finished,
    onchange: () => {
      c.checked = checkbox.checked;
      li.classList.toggle("checked", c.checked);
      updateSummary();
    },
  });
  const name = h("input", {
    type: "text",
    class: "name",
    value: c.name,
    disabled: finished,
    oninput: () => { c.name = name.value; },
  });
  const extra = c.itemIDs.length - c.primaryCount;
  const count = h("span", { class: "count", title: extra ? t("count.extra", { n: extra }) : "" },
    t("count", { n: c.itemIDs.length }));
  const toggle = h("button", { class: "link" }, t("preview"));
  let preview = null;
  toggle.addEventListener("click", () => {
    if (preview) {
      preview.remove();
      preview = null;
      toggle.textContent = t("preview");
      return;
    }
    preview = renderPreview(c);
    li.append(preview);
    toggle.textContent = t("collapse");
  });

  li.append(
    h("div", { class: "row-main" }, checkbox, name, count, toggle),
    h("div", { class: "keywords" }, ...c.keywords.map((k) => h("span", { class: "chip" }, k))),
  );
  return li;
}

function renderPreview(c) {
  const ul = h("ul", { class: "preview" });
  c.itemIDs.slice(0, PREVIEW_LIMIT).forEach((id, i) => {
    const it = info[id] || {};
    const title = it.title || t("untitled");
    const meta = [it.creator, it.year].filter(Boolean).join(" ");
    ul.append(h("li", {
      class: i >= c.primaryCount ? "secondary" : "",
      title: (i >= c.primaryCount ? t("preview.secondary") : "") + t("preview.locate", { title }),
      onclick: () => io.selectItem(id),
    }, meta ? h("span", { class: "meta" }, meta) : null, title));
  });
  if (c.itemIDs.length > PREVIEW_LIMIT) {
    ul.append(h("li", { class: "meta" }, t("preview.more", { n: c.itemIDs.length - PREVIEW_LIMIT })));
  }
  return ul;
}

function selectedClusters() {
  return clusters.filter((c) => c.checked);
}

function updateSummary() {
  const sel = selectedClusters();
  const items = new Set();
  for (const c of sel) for (const id of c.itemIDs) items.add(id);
  if (!finished) {
    $("summary").textContent = sel.length ? t("summary", { n: sel.length, items: items.size }) : "";
  }
  $("apply").disabled = busy || finished || !sel.length;
}

async function apply() {
  const sel = selectedClusters();
  const names = sel.map((c) => c.name.trim());
  const dup = names.find((n, i) => n && names.indexOf(n) !== i);
  if (dup) {
    setStatus("error", ["dupName", { name: dup }]);
    return;
  }
  setBusy(true);
  setStatus("", ["status.creating"]);
  try {
    const parentName = $("parent-name").value.trim() || io.defaultParentName;
    const res = await io.apply(parentName, sel.map((c) => ({ name: c.name, itemIDs: c.itemIDs })),
      (done, total) => setStatus("", ["status.creatingN", { done, total }]));
    finished = true;
    setStatus("done", ["status.done", { parent: res.parentName, created: res.created, added: res.added }]);
    $("summary").textContent = "";
    $("cancel").textContent = t("close");
    render();
  }
  catch (e) {
    setStatus("error", ["status.applyFailed", { error: String(e) }]);
    Components.utils.reportError(e);
  }
  finally {
    setBusy(false);
  }
}

function setAll(checked) {
  for (const c of clusters) c.checked = checked;
  render();
}

window.addEventListener("load", () => {
  $("language").value = io.getLanguagePref();
  applyStaticText();
  $("parent-name").value = io.defaultParentName;
  if (io.isCollection) $("subs-label").hidden = false;

  $("language").addEventListener("change", () => setLanguage($("language").value));
  $("rescan").addEventListener("click", scan);
  $("multi").addEventListener("change", scan);
  $("subs").addEventListener("change", scan);
  $("k").addEventListener("keydown", (e) => { if (e.key === "Enter") scan(); });
  $("select-all").addEventListener("click", () => setAll(true));
  $("select-none").addEventListener("click", () => setAll(false));
  $("cancel").addEventListener("click", () => window.close());
  $("apply").addEventListener("click", apply);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !busy) window.close(); });

  scan();
});
