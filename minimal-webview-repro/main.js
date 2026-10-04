/*
 * Minimized independent CDP reproduction.
 * This is not a copy of Orca's maintained cdp-screenshot.ts and makes no claim
 * to be an unchanged maintained function. It preserves the observed normal-mode
 * shape: one Page.getLayoutMetrics, one primary Page.captureScreenshot with a CSS
 * clip and captureBeyondViewport, plus one discarded native capturePage pulse.
 */
const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = __dirname
const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
const runRoot = path.join(root, 'runs', runId)
const artifact = path.join(runRoot, 'artifacts', 'normal.png')
const receiptRoot = path.join(runRoot, 'receipt')
const resultPath = path.join(receiptRoot, 'normal-result.json')
const teardownPath = path.join(receiptRoot, 'teardown.json')
const errorPath = path.join(receiptRoot, 'error.txt')
fs.mkdirSync(path.dirname(artifact), { recursive: true })
fs.mkdirSync(receiptRoot, { recursive: true })
const eventLog = []
const at = () => new Date().toISOString()
const event = (name, fields = {}) => eventLog.push({ name, at: at(), ...fields })
const geometry = (guest) => guest.executeJavaScript(`({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollHeight:document.documentElement.scrollHeight,readyState:document.readyState})`)

async function main() {
  app.setPath('userData', path.join(runRoot, 'profile'))
  await app.whenReady()
  const win = new BrowserWindow({ show: false, useContentSize: true, width: 1152, height: 682, webPreferences: { webviewTag: true, contextIsolation: true, nodeIntegration: false } })
  event('window-created', { visible: win.isVisible(), focused: win.isFocused(), contentSize: win.getContentSize() })
  const attached = new Promise((resolve) => win.webContents.once('did-attach-webview', (_event, guest) => resolve(guest)))
  await win.loadFile(path.join(root, 'host.html'))
  const guest = await attached
  await new Promise((resolve) => guest.once('did-finish-load', resolve))
  const before = await geometry(guest)
  event('guest-ready', before)
  if (before.width !== 1152 || before.height !== 682 || before.dpr !== 1 || before.scrollHeight !== 2728 || before.readyState !== 'complete') throw new Error('normal fixture geometry mismatch; no capture issued')
  guest.debugger.attach('1.3')
  const send = guest.debugger.sendCommand.bind(guest.debugger)
  guest.debugger.sendCommand = (method, params) => { event('cdp-start', { method, params: params || {} }); return send(method, params).then(value => { event('cdp-settled', { method }); return value }) }
  const nativeCapture = guest.capturePage.bind(guest)
  let pulsePromise = null
  const pulse = () => {
    if (pulsePromise) return
    event('native-pulse-start', { visible: win.isVisible(), focused: win.isFocused(), options: { stayHidden: true, stayAwake: false } })
    pulsePromise = Promise.resolve(nativeCapture(undefined, { stayHidden: true, stayAwake: false })).then(image => event('native-pulse-settled', { size: image.getSize(), empty: image.isEmpty() }), error => event('native-pulse-rejected', { message: String(error) }))
  }
  const metrics = await guest.debugger.sendCommand('Page.getLayoutMetrics', {})
  const size = metrics.cssContentSize || metrics.contentSize
  const clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 }
  const pulseTimer = setTimeout(pulse, 250)
  let primary
  try { guest.invalidate(); primary = await guest.debugger.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip }) } finally { clearTimeout(pulseTimer) }
  if (!pulsePromise) pulse()
  await pulsePromise
  const bytes = Buffer.from(primary.data, 'base64')
  fs.writeFileSync(artifact, bytes, { flag: 'wx' })
  const image = nativeImage.createFromBuffer(bytes); const imageSize = image.getSize(); const bitmap = image.toBitmap()
  const sample = y => { const i = y * imageSize.width * 4; return [bitmap[i + 2], bitmap[i + 1], bitmap[i], bitmap[i + 3]] }
  const after = await geometry(guest)
  const result = { mode: 'normal-fixed-parent', runId, electron: process.versions.electron, events: eventLog, before, after, capture: { bytes: bytes.length, magic: bytes.subarray(0, 8).toString('hex'), width: imageSize.width, height: imageSize.height, samples: [341, 1023, 1705, 2387].map(y => ({ y, rgba: sample(y) })) }, beforeClose: { visible: win.isVisible(), focused: win.isFocused() } }
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  guest.debugger.detach(); win.destroy(); fs.writeFileSync(teardownPath, JSON.stringify({ windowsAfter: BrowserWindow.getAllWindows().length, at: at() }) + '\n', { flag: 'wx' }); app.quit()
}
main().catch(error => { fs.writeFileSync(errorPath, String(error.stack || error) + '\n', { flag: 'wx' }); app.exit(1) })


