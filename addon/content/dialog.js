/* Dialog UI. All Zotero access goes through the `io` object passed by autosort.js. */
"use strict";

const io = window.arguments[0].wrappedJSObject || window.arguments[0];
const HTML_NS = "http://www.w3.org/1999/xhtml";
const PREVIEW_LIMIT = 100;

const $ = (id) => document.getElementById(id);
let clusters = [];   // [{name, keywords, itemIDs, primaryCount, checked}]
let info = {};
let busy = false;
let finished = false;

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

function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}

function setBusy(b) {
  busy = b;
  for (const id of ["rescan", "k", "multi", "subs", "select-all", "select-none"]) $(id).disabled = b || finished;
  updateSummary();
}

async function scan() {
  setBusy(true);
  $("list").replaceChildren();
  setStatus("正在扫描文献…");
  try {
    const res = await io.scan({
      k: Number($("k").value) || 0,
      multiLabel: $("multi").checked,
      includeSubcollections: $("subs").checked,
      onProgress: (msg) => setStatus(msg),
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
      setStatus(`共 ${res.total} 篇文献，数量太少或缺少标题/摘要，无法生成分类。`, "error");
    }
    else {
      let msg = `共 ${res.total} 篇文献，生成 ${clusters.length} 个候选分类。`;
      if (res.unclassified.length) msg += `另有 ${res.unclassified.length} 篇因缺少标题和摘要未参与分类。`;
      setStatus(msg);
      if (!$("k").value) $("k").placeholder = `自动 (${clusters.length})`;
    }
    render();
  }
  catch (e) {
    setStatus("扫描失败：" + e, "error");
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
  const count = h("span", { class: "count", title: extra ? `${extra} 篇同时属于其他分类` : "" },
    `${c.itemIDs.length} 篇`);
  const toggle = h("button", { class: "link" }, "预览");
  let preview = null;
  toggle.addEventListener("click", () => {
    if (preview) {
      preview.remove();
      preview = null;
      toggle.textContent = "预览";
      return;
    }
    preview = renderPreview(c);
    li.append(preview);
    toggle.textContent = "收起";
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
    const it = info[id] || { title: String(id) };
    const meta = [it.creator, it.year].filter(Boolean).join(" ");
    ul.append(h("li", {
      class: i >= c.primaryCount ? "secondary" : "",
      title: (i >= c.primaryCount ? "（也属于其他分类）" : "") + "点击在 Zotero 中定位：" + it.title,
      onclick: () => io.selectItem(id),
    }, meta ? h("span", { class: "meta" }, meta) : null, it.title));
  });
  if (c.itemIDs.length > PREVIEW_LIMIT) {
    ul.append(h("li", { class: "meta" }, `……还有 ${c.itemIDs.length - PREVIEW_LIMIT} 篇`));
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
    $("summary").textContent = sel.length
      ? `已选 ${sel.length} 个分类，共 ${items.size} 篇文献（原有分类不受影响）`
      : "";
  }
  $("apply").disabled = busy || finished || !sel.length;
}

async function apply() {
  const sel = selectedClusters();
  const names = sel.map((c) => c.name.trim());
  const dup = names.find((n, i) => n && names.indexOf(n) !== i);
  if (dup) {
    setStatus(`分类名称重复：「${dup}」，请修改后再创建。`, "error");
    return;
  }
  setBusy(true);
  setStatus("正在创建分类…");
  try {
    const parentName = $("parent-name").value.trim() || io.defaultParentName;
    const res = await io.apply(parentName, sel.map((c) => ({ name: c.name, itemIDs: c.itemIDs })),
      (done, total) => setStatus(`正在创建分类…（${done}/${total}）`));
    finished = true;
    setStatus(`完成：在「${res.parentName}」下新建 ${res.created} 个子分类，新增 ${res.added} 条文献归类。`, "done");
    $("summary").textContent = "";
    $("cancel").textContent = "关闭";
    render();
  }
  catch (e) {
    setStatus("创建失败：" + e, "error");
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
  $("scope").textContent = `扫描范围：${io.scopeLabel}`;
  $("parent-name").value = io.defaultParentName;
  if (io.isCollection) $("subs-label").hidden = false;

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
