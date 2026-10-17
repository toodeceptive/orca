import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, WebContents, WebContentsView } from 'electron'

const mocks = vi.hoisted(() => ({
  fromId: vi.fn(),
  appGetPath: vi.fn(() => '/downloads'),
  popup: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getPath: mocks.appGetPath },
  webContents: { fromId: mocks.fromId },
  BrowserWindow: { fromWebContents: vi.fn() },
  clipboard: { writeText: vi.fn() },
  shell: { openExternal: vi.fn() },
  Menu: { buildFromTemplate: vi.fn() },
  screen: { getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })) }
}))
vi.mock('./popup-origin-bar-window', () => ({ openPopupWithOriginBar: mocks.popup }))

import { browserManager } from './browser-manager'
import { resetBrowserManagerState } from './browser-manager-test-harness'
import { DesktopOwnedBrowserViewAdmission } from './desktop-owned-browser-view-admission'

const contentsById = new Map<number, unknown>()

function rig(id = 7, type = 'window', pageId = 'owned-page') {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this fixture only compares Session identity; no Session method is called.
  const session = {} as Session
  const guestFixture = {
    id,
    isDestroyed: () => false,
    getType: () => type,
    session,
    setBackgroundThrottling: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the mock implements the policy/registration APIs exercised by this suite.
  const guest = guestFixture as unknown as WebContents
  const renderer = {
    id: 8,
    isDestroyed: () => false,
    send: vi.fn(),
    setBackgroundThrottling: vi.fn()
  }
  contentsById.set(id, guest)
  contentsById.set(8, renderer)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: registration inspects this view's identity and webContents, not native view APIs.
  const view = { webContents: guest } as WebContentsView
  const host = {
    isDestroyed: () => false,
    webContents: renderer,
    contentView: { children: [view] }
  }
  const admission = new DesktopOwnedBrowserViewAdmission({
    isKnownPartition: () => 'persist:fixture',
    getSession: () => session,
    createView: () => view,
    attachPolicies: (contents) => browserManager.attachGuestPolicies(contents)
  })
  const record = admission.create({
    browserPageId: pageId,
    workspaceId: 'workspace',
    worktreeId: 'worktree',
    sessionProfileId: 'profile',
    rendererWebContentsId: 8
  })
  return { guest, guestFixture, renderer, view, host, record }
}

describe('BrowserManager capture backend', () => {
  beforeEach(() => {
    resetBrowserManagerState()
    contentsById.clear()
    mocks.fromId.mockReset()
    mocks.fromId.mockImplementation((id: number) => contentsById.get(id) ?? null)
  })

  it('identifies a live registered owned view without changing registration', () => {
    const fixture = rig()
    expect(browserManager.registerOwnedView(fixture.record, fixture.host)).toBe(true)
    expect(browserManager.getCaptureBackendForTab('owned-page')).toBe('owned-view')
    expect(browserManager.getGuestWebContentsId('owned-page')).toBe(7)
    expect(browserManager.isOwnedViewPage('owned-page')).toBe(true)
    contentsById.delete(7)
    expect(browserManager.getCaptureBackendForTab('owned-page')).toBe('unknown')
    contentsById.set(7, fixture.guest)
    fixture.guestFixture.isDestroyed = () => true
    expect(browserManager.getCaptureBackendForTab('owned-page')).toBe('unknown')
  })

  it('identifies only a live registered legacy webview', () => {
    const fixture = rig(7, 'webview', 'legacy-page')
    expect(
      browserManager.registerGuest({
        browserPageId: 'legacy-page',
        webContentsId: 7,
        rendererWebContentsId: 8
      })
    ).toBe(true)
    expect(browserManager.getCaptureBackendForTab('legacy-page')).toBe('webview')
    expect(browserManager.getCaptureBackendForTab('unregistered')).toBe('unknown')
    fixture.guestFixture.getType = () => 'window'
    expect(browserManager.getCaptureBackendForTab('legacy-page')).toBe('unknown')
    fixture.guestFixture.getType = () => {
      throw new Error('guest unavailable')
    }
    expect(browserManager.getCaptureBackendForTab('legacy-page')).toBe('unknown')
  })

  it('fails closed for lookup failures and mismatched guest identity', () => {
    const fixture = rig()
    expect(browserManager.registerOwnedView(fixture.record, fixture.host)).toBe(true)
    contentsById.set(7, { id: 99, isDestroyed: () => false, getType: () => 'webview' })
    expect(browserManager.getCaptureBackendForTab('owned-page')).toBe('unknown')
    mocks.fromId.mockImplementation(() => {
      throw new Error('lookup unavailable')
    })
    expect(browserManager.getCaptureBackendForTab('owned-page')).toBe('unknown')
  })
})
