# Native paint probe evidence

These unedited synthetic captures verify the two-file screenshot candidate at source commit 7ef977e0558b05c50eed501ea99a2968ed022154 on Windows Electron 43.7.5.

The page has four 682-pixel-high red, green, blue and yellow bands, a width of 1152 pixels, total height 2728 and DPR 1. Every fixture window was hidden and unfocused and was destroyed after capture. Source and result hashes are in [observations.json](observations.json).

| Correct controlled output | Unresolved normal-parent guest |
| --- | --- |
| ![Four bands](correct.png) | ![Red first band repeated](guest-normal-unresolved.png) |

The top-level BrowserWindow uses a 1152 by 682 viewport. PNG and [JPEG](correct.jpeg) have correct magic, 1152 by 2728 dimensions and all four bands. Each primary request settled before the first delayed native pulse, so this confirms top-level regression behavior without exercising a pulse.

The embedded guest also produced exactly these PNG/JPEG bytes when its owned hidden test parent was temporarily enlarged to 2728 pixels. Those captures exercised one PNG or two sequential JPEG native pulses. The original parent bounds, null inline styles and 682-pixel guest height were restored exactly. The native pulse pixels were discarded; the published images are the primary CDP outputs.

At the normal 682-pixel physical parent size, guest full-page output still repeats the first band. A screencast pulse, paired emulated viewport/visible-size commands and a full-page native capture rectangle did not repair it. That unresolved guest limitation needs a separate surface-allocation design. This patch does not resize production windows or apply viewport emulation.

Focused screenshot tests (22), Node typecheck and changed-file formatting/lint passed with independent source and image review. Installed Orca, broad repository checks, other platforms, upstream merge/release and normal-parent guest correctness remain unverified.

## Portable minimal reproduction

The [independent hidden-webview reproduction](minimal-webview-repro/README.md) contains self-contained harness source and a synthetic fixture, with an externally supplied Electron43.7.5 runtime. Its final verified Windows run uses a normal1152x682 guest and returns an unedited1152x2728 PNG whose four center samples all repeat red. It issues one primary CDP screenshot and one discarded native pulse, preserves hidden/unfocused state, and exits with zero windows. The harness is a minimized independent reproduction, not a bundled or unchanged Orca implementation. Each invocation creates a fresh ignored output directory. The package identifies its sanitized public stderr summary separately from excluded raw logs; only its15-file allowlist is published.
