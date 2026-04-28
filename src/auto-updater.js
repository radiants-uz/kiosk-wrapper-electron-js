// Auto-update flow for unattended museum kiosks.
//
// Behavior:
//   * Never shows dialogs - kiosks have no operator standing by.
//   * Never blocks startup - if the update server is unreachable, the app
//     boots normally and just retries on the next interval.
//   * Installs updates IMMEDIATELY when downloaded - the kiosk restarts as
//     soon as a new build is ready (typically <1 minute end-to-end).
//   * Belt-and-suspenders: autoInstallOnAppQuit catches anything missed
//     (e.g. PC reboot mid-download).

const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const {
  UPDATE_CHECK_INITIAL_DELAY_MS,
  UPDATE_CHECK_INTERVAL_MS,
} = require("./constants");

let initialized = false;
let pollTimers = [];

const fmtErr = (err) =>
  err ? String(err.stack || err.message || err) : "unknown";

function safeCheckForUpdates() {
  autoUpdater.checkForUpdates().catch((err) => {
    log.warn("[Updater] checkForUpdates failed (non-fatal):", fmtErr(err));
  });
}

function cleanup() {
  pollTimers.forEach((t) => {
    clearTimeout(t);
    clearInterval(t);
  });
  pollTimers = [];
}

function setup({ appVersion, isPackaged, requestQuit, logFileMaxBytes }) {
  if (initialized) {
    log.warn("[Updater] setup() called twice; ignoring.");
    return cleanup;
  }
  initialized = true;

  if (typeof logFileMaxBytes === "number") {
    log.transports.file.maxSize = logFileMaxBytes;
  }
  log.transports.file.level = "info";
  log.transports.console.level = "debug";

  if (!isPackaged) {
    log.info("[Updater] Skipped (running in dev mode).");
    return cleanup;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  log.info(`[App] v${appVersion} starting (auto-updater enabled).`);

  autoUpdater.on("checking-for-update", () => {
    log.info("[Updater] Checking for updates...");
  });
  autoUpdater.on("update-available", (info) => {
    log.info(`[Updater] Update available: v${info.version}`);
  });
  autoUpdater.on("update-not-available", (info) => {
    log.info(
      `[Updater] No update available (current: v${info && info.version}).`,
    );
  });
  autoUpdater.on("error", (err) => {
    log.warn("[Updater] Error (non-fatal):", fmtErr(err));
  });

  // Throttle: emit only when crossing each 10% boundary, so a multi-MB
  // update produces ~10 lines instead of hundreds.
  let lastLoggedTenth = -1;
  autoUpdater.on("download-progress", (p) => {
    const tenth = Math.floor(p.percent / 10);
    if (tenth === lastLoggedTenth) return;
    lastLoggedTenth = tenth;
    log.info(
      `[Updater] Download ${p.percent.toFixed(1)}% (${(
        p.bytesPerSecond / 1024
      ).toFixed(0)} KB/s)`,
    );
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info(`[Updater] Update v${info.version} downloaded - installing now.`);
    requestQuit();
    // isSilent=true (no UI), isForceRunAfter=true (relaunch post-install
    // so the kiosk comes back up without manual intervention).
    autoUpdater.quitAndInstall(true, true);
  });

  pollTimers.push(setTimeout(safeCheckForUpdates, UPDATE_CHECK_INITIAL_DELAY_MS));
  pollTimers.push(setInterval(safeCheckForUpdates, UPDATE_CHECK_INTERVAL_MS));

  return cleanup;
}

module.exports = { setup };
