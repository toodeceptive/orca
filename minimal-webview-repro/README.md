# Electron webview full-page minimal reproduction

This is a **minimized independent CDP reproduction**, not a copy of Orca's maintained capture implementation. It uses a synthetic 1152px-wide page with four 682px red, green, blue, and yellow bands in a hidden 1152×682 Electron `<webview>`.

It makes one primary `Page.captureScreenshot` request using CSS layout bounds and `captureBeyondViewport: true`. A single `webContents.capturePage` pulse uses `stayHidden: true` and `stayAwake: false`; its pixels are discarded.

## Requirements and invocation

Supply an existing Electron **43.7.5** executable; this package has no dependencies and never installs anything. From this directory, use the syntax for your shell.

PowerShell:

```powershell
& "<electron-43.7.5-directory>/electron.exe" .
```

Command Prompt:

```bat
"<electron-43.7.5-directory>/electron.exe" .
```

On non-Windows platforms, invoke that platform's Electron 43.7.5 executable with `.` as the argument. Do not use `npx` or a package-manager install command.

Each invocation creates a fresh relative `runs/<run-id>/` directory containing `artifacts/normal.png`, `receipt/`, and an isolated `profile/`. It never writes into the package's checked-in evidence paths. The local `runs/`, `profile/`, and `backup/` directories are ignored and must not be published.

## Expected observation

The normal fixed-parent fixture first verifies guest geometry 1152×682, DPR 1, document height 2728. The retained image should be 1152×2728 PNG. In the observed Windows/Electron 43.7.5 run, the four center samples repeat the first red band rather than yielding red, green, blue, yellow.

This package does not test Orca's renderer, BrowserManager, IPC paint hold, installed application, or any universal Electron claim. It is intended only to reproduce the narrow hidden-webview/CDP condition with synthetic content.
