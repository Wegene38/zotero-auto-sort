/* global Zotero, Services, Cc, Ci, AutoSort */
var chromeHandle;

function install() {}

async function startup({ id, version, rootURI }) {
  await Zotero.initializationPromise;

  const aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup);
  const manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [["content", "autosort", rootURI + "content/"]]);

  Services.scriptloader.loadSubScript(rootURI + "content/i18n.js");
  Services.scriptloader.loadSubScript(rootURI + "content/classifier.js");
  Services.scriptloader.loadSubScript(rootURI + "content/autosort.js");
  AutoSort.init({ id, version, rootURI });
  AutoSort.addToAllWindows();
}

function onMainWindowLoad({ window }) {
  AutoSort.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  AutoSort.removeFromWindow(window);
}

function shutdown() {
  if (typeof AutoSort !== "undefined") {
    AutoSort.shutdown();
    AutoSort = undefined;
  }
  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

function uninstall() {}
