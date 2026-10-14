// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DesktopBrowserViewApi,
  DesktopBrowserViewCreateArgs
} from '../../../../../shared/desktop-browser-view-protocol'

const registry = vi.hoisted(() => ({
  ensure: vi.fn(async (api: DesktopBrowserViewApi, args: DesktopBrowserViewCreateArgs) => ({
    api,
    args
  })),
  close: vi.fn(async () => {})
}))

vi.mock('./desktop-browser-page-registry', () => ({
  ensureDesktopBrowserPage: registry.ensure,
  closeDesktopBrowserPage: registry.close
}))

import { useDesktopBrowserPage } from './use-desktop-browser-page'

function api(): DesktopBrowserViewApi {
  return {
    create: vi.fn(),
    close: vi.fn(),
    command: vi.fn(),
    updateLayout: vi.fn(),
    input: vi.fn(),
    captureViewport: vi.fn(),
    onEvent: vi.fn()
  }
}

function args(url: string, workspaceId = 'workspace'): DesktopBrowserViewCreateArgs {
  return { browserPageId: 'page', workspaceId, worktreeId: 'folder', sessionProfileId: null, url }
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('desktop browser page committed creation arguments', () => {
  it('creates with the initial arguments and retains the page during URL-only updates', async () => {
    const desktopApi = api()
    const initialArgs = args('https://initial.test/')
    const view = renderHook((options) => useDesktopBrowserPage(desktopApi, options), {
      initialProps: initialArgs
    })
    await flush()
    expect(registry.ensure).toHaveBeenCalledExactlyOnceWith(desktopApi, initialArgs)
    const initialPage = view.result.current.page

    view.rerender(args('https://updated.test/'))
    await flush()
    expect(registry.ensure).toHaveBeenCalledTimes(1)
    expect(view.result.current.page).toBe(initialPage)

    act(() => view.result.current.recover())
    await flush()
    expect(registry.close).toHaveBeenCalledExactlyOnceWith('page')
    expect(registry.ensure).toHaveBeenLastCalledWith(desktopApi, args('https://updated.test/'))
    expect(registry.ensure).toHaveBeenCalledTimes(2)
  })

  it('uses the committed URL when the API or page identity changes', async () => {
    const desktopApi = api()
    const initialProps: {
      enabled: DesktopBrowserViewApi | undefined
      options: DesktopBrowserViewCreateArgs
    } = { enabled: undefined, options: args('https://initial.test/') }
    const view = renderHook(({ enabled, options }) => useDesktopBrowserPage(enabled, options), {
      initialProps
    })
    expect(registry.ensure).not.toHaveBeenCalled()
    const enabledArgs = args('https://enabled.test/')
    view.rerender({ enabled: desktopApi, options: enabledArgs })
    await flush()
    expect(registry.ensure).toHaveBeenCalledExactlyOnceWith(desktopApi, enabledArgs)

    const replacementArgs = args('https://replacement.test/', 'replacement-workspace')
    view.rerender({ enabled: desktopApi, options: replacementArgs })
    await flush()
    expect(registry.ensure).toHaveBeenLastCalledWith(desktopApi, replacementArgs)
    expect(view.result.current.page?.args).toBe(replacementArgs)
  })
})
