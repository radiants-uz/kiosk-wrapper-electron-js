const {
  app,
  BrowserWindow,
  session,
  systemPreferences,
  ipcMain,
} = require("electron");
const path = require("path");

const APP_URL = "https://humo.hron.uz/";
const OFFLINE_FALLBACK_PATH = path.join(__dirname, "index.html");
const ALLOWED_HOSTNAMES = new Set(["humo.hron.uz", "www.humo.hron.uz"]);

let mainWindow;
let isKioskMode = true;
let isExiting = false;
let isOfflineMode = false;
let retryIntervalId = null;

app.commandLine.appendSwitch("enable-features", "MediaStreamTrack");
app.commandLine.appendSwitch("disable-features", "OutOfBlinkCors");

async function checkMicrophonePermission() {
  if (process.platform === "darwin") {
    const status = systemPreferences.getMediaAccessStatus("microphone");
    console.log("Microphone permission status:", status);

    if (status === "not-determined") {
      const granted = await systemPreferences.askForMediaAccess("microphone");
      console.log("Microphone permission granted:", granted);
      return granted;
    }

    return status === "granted";
  }
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: true,
    kiosk: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      devTools: true,
    },
  });

  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      console.log(
        `[Permission Request] ${permission} from ${details.requestingUrl}`
      );

      if (
        permission === "media" ||
        permission === "audioCapture" ||
        permission === "microphone"
      ) {
        try {
          const requestingUrl = new URL(details.requestingUrl || "");
          const allowed = ALLOWED_HOSTNAMES.has(requestingUrl.hostname);
          console.log(
            `[Permission] ${
              allowed ? "Granted" : "Denied"
            }: ${permission} for ${requestingUrl.hostname}`
          );
          return callback(allowed);
        } catch (error) {
          console.warn(
            `[Permission] Denied: ${permission} due to invalid URL`,
            details.requestingUrl
          );
          return callback(false);
        }
      }

      callback(false);
    }
  );

  mainWindow.webContents.on(
    "console-message",
    (event, level, message, line, sourceId) => {
      console.log(`[Renderer Console] ${message}`);
    }
  );

  const startOnlineRetryLoop = () => {
    if (retryIntervalId !== null) return;
    const { net } = require("electron");
    retryIntervalId = setInterval(async () => {
      try {
        if (net.isOnline()) {
          console.log("Network detected. Attempting to load external URL...");
          await mainWindow.loadURL(APP_URL);
          isOfflineMode = false;
          clearInterval(retryIntervalId);
          retryIntervalId = null;
        }
      } catch (e) {
        // stay offline, keep trying
      }
    }, 30000); // retry every 30s
  };

  const loadApp = async () => {
    const { net } = require("electron");
    try {
      if (net.isOnline()) {
        await mainWindow.loadURL(APP_URL);
        isOfflineMode = false;
      } else {
        throw new Error("No internet connection");
      }
    } catch (error) {
      console.log(
        "Offline or failed to load external URL, showing local fallback:",
        error.message
      );
      isOfflineMode = true;
      await mainWindow.loadFile(OFFLINE_FALLBACK_PATH);
      startOnlineRetryLoop();
    }
  };

  loadApp();

  mainWindow.webContents.once("dom-ready", async () => {
    // Set zoom factor to 0.75 (75%) as soon as DOM is ready
    try {
      await mainWindow.webContents.setZoomFactor(0.75);
    } catch (e) {
      console.error("Failed to set zoom factor:", e);
    }

    // Add exit button and zoom buttons
    mainWindow.webContents.executeJavaScript(`
      const { ipcRenderer } = require('electron');
      
      // Create zoom in button
      const zoomInButton = document.createElement('button');
      zoomInButton.innerHTML = '+';
      zoomInButton.style.cssText = \`
        position: fixed;
        top: 20px;
        left: 20px;
        z-index: 999999;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        border: 2px solid rgba(255, 255, 255, 0.3);
        padding: 15px 25px;
        border-radius: 8px;
        font-size: 24px;
        font-weight: bold;
        cursor: pointer;
        opacity: 0;
        transition: all 0.3s ease;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
      \`;

      // Create zoom out button
      const zoomOutButton = document.createElement('button');
      zoomOutButton.innerHTML = '−';
      zoomOutButton.style.cssText = \`
        position: fixed;
        top: 20px;
        left: 90px;
        z-index: 999999;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        border: 2px solid rgba(255, 255, 255, 0.3);
        padding: 15px 25px;
        border-radius: 8px;
        font-size: 24px;
        font-weight: bold;
        cursor: pointer;
        opacity: 0;
        transition: all 0.3s ease;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
      \`;


      // Zoom button click handlers
      zoomInButton.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof ipcRenderer !== "undefined") {
          ipcRenderer.send('zoom-in');
        }
      });

      zoomOutButton.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof ipcRenderer !== "undefined") {
          ipcRenderer.send('zoom-out');
        }
      });

      // Create exit button
      const exitButton = document.createElement('button');
      exitButton.innerHTML = 'Exit';
      exitButton.style.cssText = \`
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        background: transparent;
        color: transparent;
        border: none;
        padding: 30px 40px;
        border-radius: 5px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        opacity: 0;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
      \`;

      let holdTimer = null;
      const requiredHoldTime = 5000; // 5 seconds
      let isHolding = false;

      // Function to start hold
      const startHold = () => {
        if (isHolding) return;
        isHolding = true;

        holdTimer = setTimeout(() => {
          if (typeof ipcRenderer !== "undefined") {
            ipcRenderer.send('request-exit');
          }
        }, requiredHoldTime);
      };

      // Function to cancel hold
      const cancelHold = () => {
        isHolding = false;

        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
      };

      // Mouse events
      exitButton.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startHold();
      });

      exitButton.addEventListener('mouseup', (e) => {
        e.preventDefault();
        cancelHold();
      });

      exitButton.addEventListener('mouseleave', (e) => {
        e.preventDefault();
        cancelHold();
      });

      // Touch events for touch panels
      exitButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startHold();
      }, { passive: false });

      exitButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        cancelHold();
      }, { passive: false });

      exitButton.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        cancelHold();
      }, { passive: false });

      // Prevent context menu on long press
      exitButton.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
      });

      // Add all buttons to page
      document.body.appendChild(zoomInButton);
      document.body.appendChild(zoomOutButton);
      document.body.appendChild(exitButton);
    `);

    // Add "Try Again" button if in offline mode
    if (isOfflineMode) {
      mainWindow.webContents.executeJavaScript(`
        const { ipcRenderer } = require('electron');
        
        const tryAgainButton = document.createElement('button');
        tryAgainButton.innerHTML = '🔄 Try Again';
        tryAgainButton.style.cssText = \`
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 999999;
          background: rgba(0, 120, 255, 0.9);
          color: white;
          border: 2px solid rgba(255, 255, 255, 0.5);
          padding: 20px 40px;
          border-radius: 12px;
          font-size: 20px;
          font-weight: bold;
          cursor: pointer;
          opacity: 1;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
          -webkit-user-select: none;
        \`;

        tryAgainButton.addEventListener('mouseenter', () => {
          tryAgainButton.style.background = 'rgba(0, 140, 255, 0.95)';
          tryAgainButton.style.transform = 'translate(-50%, -50%) scale(1.05)';
        });

        tryAgainButton.addEventListener('mouseleave', () => {
          tryAgainButton.style.background = 'rgba(0, 120, 255, 0.9)';
          tryAgainButton.style.transform = 'translate(-50%, -50%) scale(1)';
        });

        tryAgainButton.addEventListener('click', (e) => {
          e.preventDefault();
          if (typeof ipcRenderer !== "undefined") {
            ipcRenderer.send('try-again');
          }
        });

        tryAgainButton.addEventListener('touchstart', (e) => {
          tryAgainButton.style.background = 'rgba(0, 140, 255, 0.95)';
          tryAgainButton.style.transform = 'translate(-50%, -50%) scale(1.05)';
        }, { passive: true });

        tryAgainButton.addEventListener('touchend', (e) => {
          tryAgainButton.style.background = 'rgba(0, 120, 255, 0.9)';
          tryAgainButton.style.transform = 'translate(-50%, -50%) scale(1)';
        }, { passive: true });

        document.body.appendChild(tryAgainButton);

        // Add "Restart PC" button
        const restartButton = document.createElement('button');
        restartButton.innerHTML = '🔄 Restart PC';
        restartButton.style.cssText = \`
          position: fixed;
          top: 60%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 999999;
          background: rgba(255, 87, 34, 0.9);
          color: white;
          border: 2px solid rgba(255, 255, 255, 0.5);
          padding: 20px 40px;
          border-radius: 12px;
          font-size: 20px;
          font-weight: bold;
          cursor: pointer;
          opacity: 1;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
          -webkit-user-select: none;
        \`;

        restartButton.addEventListener('mouseenter', () => {
          restartButton.style.background = 'rgba(255, 107, 54, 0.95)';
          restartButton.style.transform = 'translate(-50%, -50%) scale(1.05)';
        });

        restartButton.addEventListener('mouseleave', () => {
          restartButton.style.background = 'rgba(255, 87, 34, 0.9)';
          restartButton.style.transform = 'translate(-50%, -50%) scale(1)';
        });

        restartButton.addEventListener('click', (e) => {
          e.preventDefault();
          if (typeof ipcRenderer !== "undefined") {
            ipcRenderer.send('restart-pc');
          }
        });

        restartButton.addEventListener('touchstart', (e) => {
          restartButton.style.background = 'rgba(255, 107, 54, 0.95)';
          restartButton.style.transform = 'translate(-50%, -50%) scale(1.05)';
        }, { passive: true });

        restartButton.addEventListener('touchend', (e) => {
          restartButton.style.background = 'rgba(255, 87, 34, 0.9)';
          restartButton.style.transform = 'translate(-50%, -50%) scale(1)';
        }, { passive: true });

        document.body.appendChild(restartButton);
      `);
    }
  });

  // Security features for kiosk mode
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    try {
      const targetUrl = new URL(navigationUrl);
      if (!ALLOWED_HOSTNAMES.has(targetUrl.hostname)) {
        event.preventDefault();
      }
    } catch (error) {
      console.warn("Blocked navigation to invalid URL:", navigationUrl);
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  mainWindow.webContents.session.on("will-download", (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.on("context-menu", (event) => {
    event.preventDefault();
  });

  mainWindow.on("close", (event) => {
    if (isKioskMode && !isExiting) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (isKioskMode && input.type === "keyDown") {
      if (
        input.shift &&
        (input.control || input.meta) &&
        (input.key === "c" || input.key === "C")
      ) {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
        return;
      }

      const allowedKeys = [];

      if (input.key.startsWith("F")) {
        event.preventDefault();
        return;
      }

      if (input.control || input.meta || input.alt) {
        if (["w", "W", "q", "Q", "F4"].includes(input.key)) {
          event.preventDefault();
          return;
        }

        if (input.alt && input.key === "Tab") {
          event.preventDefault();
          return;
        }

        if (input.meta) {
          event.preventDefault();
          return;
        }

        if (input.control && input.shift && input.key === "Escape") {
          event.preventDefault();
          return;
        }
      }

      if (input.key === "Escape") {
        event.preventDefault();
        return;
      }
    }
  });
}

app.whenReady().then(async () => {
  // Enable auto-start on system boot
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: false,
    args: [],
  });

  await checkMicrophonePermission();
  createWindow();

  // Handle exit request from button
  ipcMain.on("request-exit", () => {
    isExiting = true;
    mainWindow.close();
  });

  // Handle zoom in
  ipcMain.on("zoom-in", () => {
    if (mainWindow && mainWindow.webContents) {
      const currentZoom = mainWindow.webContents.getZoomFactor();
      const newZoom = Math.min(currentZoom + 0.1, 2.0); // Max zoom 200%
      mainWindow.webContents.setZoomFactor(newZoom);
      console.log(`Zoom in: ${(newZoom * 100).toFixed(0)}%`);
    }
  });

  // Handle zoom out
  ipcMain.on("zoom-out", () => {
    if (mainWindow && mainWindow.webContents) {
      const currentZoom = mainWindow.webContents.getZoomFactor();
      const newZoom = Math.max(currentZoom - 0.1, 0.5); // Min zoom 50%
      mainWindow.webContents.setZoomFactor(newZoom);
      console.log(`Zoom out: ${(newZoom * 100).toFixed(0)}%`);
    }
  });

  // Handle try again (retry loading external URL)
  ipcMain.on("try-again", async () => {
    if (mainWindow && mainWindow.webContents) {
      console.log("Retrying to load external URL...");
      try {
        const { net } = require("electron");
        const isOnline = net.isOnline();
        if (isOnline) {
          await mainWindow.loadURL(APP_URL);
          isOfflineMode = false;
          console.log("Successfully loaded external URL");
        } else {
          console.log("Still offline, cannot load external URL");
        }
      } catch (error) {
        console.log("Failed to load external URL:", error.message);
      }
    }
  });

  // Handle PC restart
  ipcMain.on("restart-pc", () => {
    console.log("Restarting PC...");
    const { exec } = require("child_process");

    // Set flag to allow app exit
    isExiting = true;

    // Execute restart command based on platform
    if (process.platform === "win32") {
      exec("shutdown /r /t 0", (error) => {
        if (error) {
          console.error("Failed to restart Windows:", error);
        }
      });
    } else if (process.platform === "darwin") {
      // Use AppleScript to request admin privileges via GUI (no TTY required)
      const appleScript =
        'do shell script "shutdown -r now" with administrator privileges';
      exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
        if (error) {
          console.error("macOS restart via AppleScript failed:", error, stderr);
          // Fallback: ask System Events to restart (may show a confirm dialog)
          exec(
            `osascript -e 'tell application "System Events" to restart'`,
            (fallbackError) => {
              if (fallbackError) {
                console.error("macOS restart fallback failed:", fallbackError);
              }
            }
          );
        }
      });
    } else if (process.platform === "linux") {
      // Try GUI-auth reboot first (pkexec), then systemctl, then reboot
      const linuxCmd =
        "pkexec /usr/sbin/reboot || pkexec reboot || systemctl reboot || reboot";
      exec(linuxCmd, (error, stdout, stderr) => {
        if (error) {
          console.error("Failed to restart Linux:", error, stderr);
        }
      });
    }

    setTimeout(() => {
      app.quit();
    }, 1000);
  });
});

app.on("before-quit", (event) => {
  if (isKioskMode && !isExiting) {
    event.preventDefault();
  }
});

app.on("window-all-closed", () => {
  if (isExiting || process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
