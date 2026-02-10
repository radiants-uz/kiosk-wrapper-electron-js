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
