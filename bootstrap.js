var Cc = Components.classes, Ci = Components.interfaces, Cu = Components.utils;

Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

var tempInstallData = {name: "webinstall-ninja-data.tmp"};

function getFirstInstall(installs) {
  if (installs.length != 1 || !installs[0].sourceURI || installs[0].sourceURI.scheme == "file") {
    return false;
  }
  return installs[0];
}

function saveTempFile(file) {
  let temp = file.parent;
  temp.append(tempInstallData.name);
  if (temp.exists()) {
    temp.remove(false);
  }
  file.renameTo(null, tempInstallData.name);
  tempInstallData.file = temp;
  let orig = file.parent;
  temp.copyTo(null, file.leafName);
}

function removeTempData() {
  if (tempInstallData.file && tempInstallData.file.exists()) {
    tempInstallData.file.remove(false);
  }
  delete tempInstallData.file;
  delete tempInstallData.url;
}

function saveFile(win, name, version, file) {
  let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  let bundle = Services.strings.createBundle("chrome://mozapps/locale/downloads/unknownContentType.properties");
  filePicker.init(win, bundle.GetStringFromName("saveDialogTitle"), Ci.nsIFilePicker.modeSave);
  filePicker.appendFilter("XPInstall Install", "*.xpi");
  filePicker.defaultString = name.replace(/\s/g, "-") + "-" + version + ".xpi";
  filePicker.defaultExtension = "xpi";
  if (filePicker.show() == Ci.nsIFilePicker.returnOK) {
    file.copyTo(filePicker.file.parent, filePicker.file.leafName);
  }
}

var installObserver = {
  observe: function(subject, topic, data) {
    let installInfo = subject.QueryInterface(Ci.amIWebInstallInfo);
    let doc = installInfo.browser.contentDocument;
    let install = getFirstInstall(installInfo.installs);
    if (install === false) return;
    if (topic == "webinstall-ninja-save" &&
        install.state == AddonManager.STATE_DOWNLOADED &&
        install.name && install.version &&
        install.file && install.file.exists()) {
      saveFile(doc.defaultView, install.name, install.version, install.file);
    } else if (topic == "addon-install-started") {
      tempInstallData.url = install.sourceURI && install.sourceURI.spec;
    } else if (topic == "addon-install-failed" &&
               install.sourceURI && install.sourceURI.spec == tempInstallData.url) {
      if (install.state == AddonManager.STATE_CANCELLED &&
          install.name && install.version &&
          tempInstallData.file && tempInstallData.file.exists()) {
        let browser = Services.wm.getMostRecentWindow('navigator:browser');
        let panel = browser.document.getElementById("notification-popup");
        if (panel && panel.getAttribute("popupid") == "addon-install-failed" && 
            (panel.state == "showing" || panel.state == "open")) {
          panel.saveData = {
            win: doc.defaultView,
            name: install.name,
            version: install.version
          };
          panel.addEventListener("popuphidden", this, false);
        } else {
          saveFile(doc.defaultView, install.name, install.version, tempInstallData.file);
          removeTempData();
        }
      } else {
        removeTempData();
      }
    }
  },
  handleEvent: function(e) {
    let panel = e.currentTarget;
    panel.removeEventListener(e.type, this, false);
    saveFile(panel.saveData.win, panel.saveData.name, panel.saveData.version, tempInstallData.file);
    delete panel.saveData;
    removeTempData();
  },
  onDownloadCancelled: function(install) {
    if (install.sourceURI && install.sourceURI.spec == tempInstallData.url &&
        install.file && install.file.exists()) {
      saveTempFile(install.file);
    }
  }
};

var confirmObserver = {
  observe: function(subject, topic, data) {
    if (topic == "domwindowopened") {
      subject.QueryInterface(Ci.nsIDOMWindow).addEventListener("load", this, false);
    } else if (topic == "domwindowclosed") {
      if (subject.document.documentElement.getAttribute("windowtype") == "Addons:Install" &&
          subject.document.documentElement.id == "xpinstallConfirm") {
        let saveBtn = subject.document.documentElement.getButton("extra2");
        saveBtn.removeEventListener("command", this.saveAddon);
        delete saveBtn.webInstallInfo;
      }
    }
  },
  handleEvent: function(e) {
    let win = e.currentTarget;
    win.removeEventListener(e.type, this, false);
    if (win.document.documentElement.getAttribute("windowtype") == "Addons:Install" &&
        win.document.documentElement.id == "xpinstallConfirm") {
      let args = win.arguments[0].wrappedJSObject;
      if (getFirstInstall(args.installs) === false) return;
      delete tempInstallData.url;
      let saveBtn = win.document.documentElement.getButton("extra2");
      let bundle = Services.strings.createBundle("chrome://global/locale/filepicker.properties");
      saveBtn.label = bundle.GetStringFromName("saveButtonLabel");
      saveBtn.hidden = false;
      let browser = Services.wm.getMostRecentWindow('navigator:browser').gBrowser.selectedBrowser;
      saveBtn.webInstallInfo = {
        browser: browser,
        originatingURI: args.url,
        installs: args.installs,
        QueryInterface: XPCOMUtils.generateQI([Ci.amIWebInstallInfo])
      };
      saveBtn.addEventListener("command", this.saveAddon, false);
    }
  },
  saveAddon: function(e) {
    Services.obs.notifyObservers(e.currentTarget.webInstallInfo, "webinstall-ninja-save", null);
  }
};

function startup(data, reason) {
  Services.obs.addObserver(installObserver, "webinstall-ninja-save", false);
  Services.obs.addObserver(installObserver, "addon-install-started", false);
  Services.obs.addObserver(installObserver, "addon-install-failed", false);
  AddonManager.addInstallListener(installObserver);
  Services.ww.registerNotification(confirmObserver);
}

function shutdown(data, reason) {
  if (reason == APP_SHUTDOWN) return;
  Services.ww.unregisterNotification(confirmObserver);
  AddonManager.removeAddonListener(installObserver);
  Services.obs.removeObserver(installObserver, "addon-install-failed", false);
  Services.obs.removeObserver(installObserver, "addon-install-started", false);
  Services.obs.removeObserver(installObserver, "webinstall-ninja-save", false);
}

function install(data, reason) {}
function uninstall(data, reason) {}
