# Synthetic full-page capture evidence

This package contains synthetic four-band capture outputs from the source capture
function. The fixture uses a 1152 x 682 viewport at DPR 1 and a 2728-pixel page height.
The band centres are red, green, blue, and yellow.

`before.png` has a repeated red first viewport at the green, blue, and yellow centres.
`after.png` has exact PNG samples at all four centres. `after.jpeg` has samples within
one channel value of the expected colours.

Environment: Windows, Electron 43.7.5.

File hashes and the source revision are recorded in `manifest.json`.

This validates source capture in a hidden BrowserWindow. The installed desktop guest
webview remains untested.
