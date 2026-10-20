/* global Zotero, Services, Ci, AutoSortClassifier, AutoSortI18n */
/* Plugin controller: menus, reading items from Zotero, creating collections. */

var AutoSort = {
  id: null,
  version: null,
  rootURI: null,
  dialog: null,
  ELEMENT_IDS: ["autosort-tools-menuitem", "autosort-collection-sep", "autosort-collection-menuitem"],
  LANGUAGE_PREF: "extensions.autosort.language",

  init({ id, version, rootURI }) {
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    this.log(`started v${version}`);
    if (Services.env.get("AUTOSORT_SELFTEST")) this.selfTest();
  },

  log(msg) {
    Zotero.debug("AutoSort: " + msg);
  },

  /** Language preference as stored: "auto" | "en" | "zh". */
  getLanguagePref() {
    return Zotero.Prefs.get(this.LANGUAGE_PREF, true) || "auto";
  },

  setLanguagePref(pref) {
    Zotero.Prefs.set(this.LANGUAGE_PREF, pref, true);
    for (const win of Zotero.getMainWindows()) this.updateMenuLabels(win);
  },

  /** Effective UI language: "en" | "zh". */
  get lang() {
    return AutoSortI18n.resolve(this.getLanguagePref(), Zotero.locale);
  },

  t(key, args) {
    return AutoSortI18n.t(this.lang, key, args);
  },

  updateMenuLabels(win) {
    const doc = win.document;
    doc.getElementById("autosort-tools-menuitem")?.setAttribute("label", this.t("menu.tools"));
    doc.getElementById("autosort-collection-menuitem")?.setAttribute("label", this.t("menu.collection"));
  },

  addToAllWindows() {
    for (const win of Zotero.getMainWindows()) {
      if (win.ZoteroPane) this.addToWindow(win);
    }
  },

  addToWindow(win) {
    const doc = win.document;
    if (doc.getElementById("autosort-tools-menuitem")) return;

    const tools = doc.getElementById("menu_ToolsPopup");
    if (tools) {
      const item = doc.createXULElement("menuitem");
      item.id = "autosort-tools-menuitem";
      item.addEventListener("command", () => this.openFromWindow(win));
      tools.appendChild(item);
    }

    const collMenu = doc.getElementById("zotero-collectionmenu");
    if (collMenu) {
      const sep = doc.createXULElement("menuseparator");
      sep.id = "autosort-collection-sep";
      const item = doc.createXULElement("menuitem");
      item.id = "autosort-collection-menuitem";
      item.addEventListener("command", () => this.openFromWindow(win));
      collMenu.append(sep, item);
      // Only offer it on libraries and collections the user can edit (not trash, feeds, searches…).
      collMenu.addEventListener("popupshowing", (event) => {
        if (event.target !== collMenu) return;
        const ok = !!this.getTarget(win);
        sep.hidden = !ok;
        item.hidden = !ok;
      });
    }
    this.updateMenuLabels(win);
  },

  removeFromWindow(win) {
    for (const id of this.ELEMENT_IDS) win.document.getElementById(id)?.remove();
  },

  shutdown() {
    for (const win of Zotero.getMainWindows()) this.removeFromWindow(win);
    if (this.dialog && !this.dialog.closed) this.dialog.close();
  },

  /** What the user is pointing at: { libraryID, collection|null } or null if not sortable. */
  getTarget(win) {
    const row = win.ZoteroPane.getCollectionTreeRow();
    if (!row || !row.editable) return null;
    if (row.isCollection()) return { libraryID: row.ref.libraryID, collection: row.ref };
    if (row.type === "library" || row.type === "group") return { libraryID: row.ref.libraryID, collection: null };
    return null;
  },

  openFromWindow(win) {
    let target = this.getTarget(win);
    if (!target) {
      // e.g. Tools menu while a saved search or the trash is selected: fall back to the whole library.
      const libraryID = win.ZoteroPane.getSelectedLibraryID();
      if (!Zotero.Libraries.get(libraryID)?.editable) {
        Services.prompt.alert(win, this.t("title"), this.t("readonly"));
        return;
      }
      target = { libraryID, collection: null };
    }
    this.open(win, target);
  },

  open(win, { libraryID, collection }) {
    if (this.dialog && !this.dialog.closed) this.dialog.close();
    const io = {
      scopeName: collection ? collection.name : Zotero.Libraries.getName(libraryID),
      isCollection: !!collection,
      zoteroLocale: Zotero.locale,
      getLanguagePref: () => this.getLanguagePref(),
      setLanguagePref: (pref) => this.setLanguagePref(pref),
      defaultParentName: "Auto-Sorted",
      scan: (opts) => this.scan(libraryID, collection ? collection.id : null, opts),
      apply: (parentName, groups, onProgress) => this.apply(win, libraryID, parentName, groups, onProgress),
      selectItem: (itemID) => {
        win.ZoteroPane.selectItem(itemID);
        win.focus();
      },
    };
    io.wrappedJSObject = io;
    this.dialog = win.openDialog("chrome://autosort/content/dialog.xhtml", "autosort-dialog",
      "chrome,centerscreen,resizable,dialog=no,width=760,height=680", io);
    return this.dialog;
  },

  async getItems(libraryID, collectionID, includeSubcollections) {
    let items;
    if (collectionID) {
      const ids = new Set();
      const walk = (coll) => {
        for (const id of coll.getChildItems(true)) ids.add(id);
        if (includeSubcollections) for (const child of coll.getChildCollections()) walk(child);
      };
      walk(Zotero.Collections.get(collectionID));
      items = await Zotero.Items.getAsync([...ids]);
    }
    else {
      items = await Zotero.Items.getAll(libraryID, true, false);
    }
    items = items.filter((item) => item.isRegularItem() && !item.deleted);
    await Zotero.Items.loadDataTypes(items, ["itemData", "tags", "creators"]);
    return items;
  },

  /** opts: { k, multiLabel, includeSubcollections, onProgress } */
  async scan(libraryID, collectionID, opts = {}) {
    const items = await this.getItems(libraryID, collectionID, opts.includeSubcollections);
    const docs = items.map((item) => ({
      id: item.id,
      title: item.getField("title"),
      abstract: item.getField("abstractNote"),
      tags: item.getTags().map((t) => t.tag),
    }));
    const result = await AutoSortClassifier.classify(docs, {
      k: opts.k || 0,
      multiLabel: opts.multiLabel !== false,
      onProgress: opts.onProgress,
      yieldFn: () => Zotero.Promise.delay(0),
    });
    const info = {};
    for (const item of items) {
      info[item.id] = {
        title: AutoSortClassifier.cleanTitle(item.getField("title")),
        creator: item.getField("firstCreator"),
        year: item.getField("date", true, true).slice(0, 4).replace(/^0000$/, ""),
      };
    }
    this.log(`scanned ${items.length} items into ${result.clusters.length} clusters`);
    return { total: items.length, clusters: result.clusters, unclassified: result.unclassified, info };
  },

  /**
   * Create <parentName>/<group.name> collections and add items to them.
   * Existing collections with the same names are reused; items are only added, never removed.
   */
  async apply(win, libraryID, parentName, groups, onProgress) {
    parentName = parentName.trim() || "Auto-Sorted";
    let parent = Zotero.Collections.getByLibrary(libraryID).find((c) => c.name === parentName);
    if (!parent) {
      parent = new Zotero.Collection({ libraryID, name: parentName });
      await parent.saveTx();
    }
    let created = 0, added = 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const name = g.name.trim() || `Topic ${i + 1}`;
      let sub = Zotero.Collections.getByParent(parent.id).find((c) => c.name === name);
      if (!sub) {
        sub = new Zotero.Collection({ libraryID, name, parentID: parent.id });
        await sub.saveTx();
        created++;
      }
      const before = sub.getChildItems(true).length;
      await Zotero.DB.executeTransaction(async () => {
        await sub.addItems(g.itemIDs);
      });
      added += sub.getChildItems(true).length - before;
      if (onProgress) onProgress(i + 1, groups.length);
    }
    try {
      await win.ZoteroPane.collectionsView.selectByID("C" + parent.id);
    }
    catch (e) {
      this.log("could not select parent collection: " + e);
    }
    this.log(`created ${created} collections, added ${added} item links under "${parentName}"`);
    return { parentName, created, added };
  },

  // Development check, enabled with AUTOSORT_SELFTEST=1: scan, create collections, open the dialog.
  async selfTest() {
    try {
      await Zotero.uiReadyPromise;
      const win = Zotero.getMainWindow();
      const libraryID = Zotero.Libraries.userLibraryID;
      const res = await this.scan(libraryID, null, {});
      this.log("SELFTEST scan: " + res.total + " items; " +
        res.clusters.map((c) => `${c.name} (${c.itemIDs.length})`).join("; "));
      const out = await this.apply(win, libraryID, "Auto-Sorted SelfTest", res.clusters.slice(0, 3), null);
      const again = await this.apply(win, libraryID, "Auto-Sorted SelfTest", res.clusters.slice(0, 3), null);
      this.log(`SELFTEST apply: ${JSON.stringify(out)}; rerun: ${JSON.stringify(again)}`);
      this.log(`SELFTEST Zotero.locale=${Zotero.locale}, menu="${win.document.getElementById("autosort-tools-menuitem").getAttribute("label")}"`);
      this.setLanguagePref("zh");
      const dlg = this.open(win, { libraryID, collection: null });
      dlg.addEventListener("load", async () => {
        this.log("SELFTEST dialog loaded");
        const doc = dlg.document;
        while (!doc.getElementById("list").children.length) await Zotero.Promise.delay(200);
        this.log("SELFTEST dialog rows: " + doc.getElementById("list").children.length);
        doc.getElementById("parent-name").value = "Auto-Sorted DialogTest";
        for (const cb of [...doc.querySelectorAll("#list input[type=checkbox]")].slice(0, 2)) cb.click();
        this.log("SELFTEST summary: " + doc.getElementById("summary").textContent);
        const shotPath = Services.env.get("AUTOSORT_SNAPSHOT");
        const snapshot = async (path) => {
          const bitmap = await dlg.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, "white");
          const canvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
          await IOUtils.write(path, new Uint8Array(await blob.arrayBuffer()));
          this.log("SELFTEST snapshot written: " + path);
        };
        // Expand the first cluster's preview so the screenshot shows it.
        doc.querySelector("#list .row-main button.link")?.click();
        await Zotero.Promise.delay(500);
        if (shotPath) await snapshot(shotPath.replace(/\.png$/, "-zh.png"));
        const select = doc.getElementById("language");
        select.value = "en";
        select.dispatchEvent(new dlg.Event("change"));
        await Zotero.Promise.delay(500);
        this.log(`SELFTEST language pref=${this.getLanguagePref()} status="${doc.getElementById("status").textContent}" ` +
          `summary="${doc.getElementById("summary").textContent}" menu="${win.document.getElementById("autosort-tools-menuitem").getAttribute("label")}"`);
        if (shotPath) await snapshot(shotPath.replace(/\.png$/, "-en.png"));
        await Zotero.Promise.delay(1500);
        doc.getElementById("apply").click();
        while (!/done|error/.test(doc.getElementById("status").className)) await Zotero.Promise.delay(200);
        this.log("SELFTEST dialog status: " + doc.getElementById("status").textContent);
        Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
      });
    }
    catch (e) {
      this.log("SELFTEST FAILED: " + e + "\n" + e.stack);
    }
  },
};
