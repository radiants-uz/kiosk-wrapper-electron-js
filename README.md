# Electron + Vite + React Integration

This project demonstrates how to run a Vite + React project inside an Electron application.

## Project Structure

- Root directory: Contains the Electron main process (`main.js`)
- `project/` directory: Contains the Vite + React application

## Setup

1. Install dependencies for both the root and project directories:
   ```bash
   npm install
   npm run install:project
   ```

## Development

To run the application in development mode (with hot reload):

```bash
npm run dev
```

This will:

- Start the Vite dev server on port 5173
- Launch Electron and load the Vite dev server
- Enable hot module replacement (HMR)

## Production Build

To build and run the application in production mode:

```bash
npm run build:electron
```

This will:

- Build the Vite project to `project/dist/`
- Launch Electron and load the built files

## Available Scripts

- `npm run dev` - Run in development mode with Vite dev server
- `npm run build` - Build the Vite project only
- `npm run build:electron` - Build and run in production mode
- `npm start` - Run Electron in production mode (requires built files)
- `npm run install:project` - Install dependencies in the project directory

## How It Works

The `main.js` file detects the environment:

- **Development**: Starts Vite dev server and loads `http://localhost:5173`
- **Production**: Loads the built files from `project/dist/index.html`

The Vite configuration is optimized for Electron with:

- `base: './'` for relative asset paths
- Proper build output configuration
- Fixed port for dev server
# electron-js-kiosk-mode
# kiosk-application-electron-js

---

## Auto-Updates (museum kiosk fleet)

The app uses [`electron-updater`](https://www.electron.build/auto-update) with the `generic` provider to pull updates from a self-hosted server. Update flow on each of the 20 kiosks:

1. App launches normally — never blocks on the update server.
2. ~30 seconds after launch and then every 4 hours, it checks the update URL.
3. If a newer version exists, it's downloaded silently in the background.
4. Once downloaded, the install is scheduled for the next 03:00–05:00 local-time window. If the PC restarts before then, the update installs on next quit (`autoInstallOnAppQuit`).
5. After install, the app relaunches automatically (the kiosk comes back up on its own).

All update activity is logged to `%AppData%\Iccu Platform\logs\main.log` on the kiosk PC. Pull this file remotely (TeamViewer / RDP / file share) to debug any update issue.

### Bumping the version and shipping a new build

1. Edit `version` in [package.json](package.json) (e.g. `2.0.1` → `2.0.2`). `electron-updater` uses semver, so the new version must be strictly greater than the deployed one.
2. From a Windows machine (or use the existing CI), run:
   ```
   npm install
   npm run dist:win
   ```
3. Three artifacts to upload from [dist/](dist/):
   - `Iccu Platform Setup X.Y.Z.exe` — the full installer
   - `Iccu Platform Setup X.Y.Z.exe.blockmap` — used for delta updates (smaller downloads)
   - `latest.yml` — the metadata file the updater fetches first

### Where to put them on the update server

The configured publish URL is `https://updates.example.com/museum-app/`. **Replace this placeholder** in [package.json](package.json) (`build.publish[0].url`) before the first real release.

Upload all three files into that directory, accessible exactly as:
```
https://updates.example.com/museum-app/latest.yml
https://updates.example.com/museum-app/Iccu Platform Setup X.Y.Z.exe
https://updates.example.com/museum-app/Iccu Platform Setup X.Y.Z.exe.blockmap
```

Server-side requirements:
- HTTPS strongly recommended (avoids MITM tampering with installers).
- The web server must serve `.yml` files with a sensible `Content-Type` (text/plain or text/yaml). Some setups default to `application/octet-stream` and downloads still work, but it's worth verifying on first deploy.
- The exe URL contains a space — make sure the server URL-encodes correctly. Most do; verify by hitting the URL in a browser.

### Testing on one kiosk before rolling out

Critical: never push an untested build to all 20 PCs.

1. Bump version to e.g. `2.0.2-test` and build.
2. Upload the three artifacts to the update server.
3. On ONE kiosk: launch the app and tail the log file:
   ```
   Get-Content "$env:APPDATA\Iccu Platform\logs\main.log" -Wait
   ```
4. Within ~30 seconds you should see `Checking for updates...`, then `Update available: v2.0.2-test`, then `Download X%`, then `Update v2.0.2-test downloaded - scheduling install.`
5. To skip the 03:00 wait during testing, you can either wait or temporarily change the schedule logic in [main.js](main.js) `scheduleQuietInstall()`. Keep that change OUT of the production build.
6. Confirm the app relaunches on its own and reports the new version in the log on next start.
7. Only after that one kiosk is healthy, leave the other 19 to pick up the update on their next interval.

### First-time deployment notes

- The currently deployed v2.0.1 builds were installed under `productName: history` and `appId: com.kiosk.secure-app`. The new build uses `Iccu Platform` / `iccu.museum.touchscreen`. **NSIS will treat this as a different application** — you'll need to manually uninstall the old "history" app and install the new "Iccu Platform" build once on each kiosk. From that point forward, all future updates are automatic.
- The auto-update mechanism requires the kiosk PC to run the app with permissions to write to `Program Files` (per-machine install). The current config assumes this — if a kiosk runs as a limited user, `quitAndInstall` will silently fail. Check the log file to confirm.

