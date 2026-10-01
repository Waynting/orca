// @vitest-environment happy-dom

import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/client-environment-info', () => ({
  resolveClientEnvironmentFooter: vi.fn().mockResolvedValue('')
}))

import { TerminalErrorToast, humanizeTerminalError } from './TerminalErrorToast'

// The shape a missing folder workspace reaches the toast in when its terminal spawn is rejected.
const MISSING_FOLDER_ERROR =
  "Error invoking remote method 'pty:spawn': Error: folder_workspace_path_missing:/Users/me/ara_company"

afterEach(() => {
  cleanup()
})

describe('TerminalErrorToast folder workspace path errors', () => {
  it('replaces the raw missing-folder code with actionable copy', () => {
    const humanized = humanizeTerminalError(MISSING_FOLDER_ERROR)

    expect(humanized).not.toContain('folder_workspace_path_missing')
    expect(humanized).toBe(
      'Orca cannot find /Users/me/ara_company. Remove and re-import the folder.'
    )
  })

  it('keeps unrelated lines when one line is a folder path error', () => {
    const humanized = humanizeTerminalError(
      ['folder_workspace_path_not_directory:/srv/app', 'Another error'].join('\n')
    )

    expect(humanized).toBe(['/srv/app exists, but it is not a folder.', 'Another error'].join('\n'))
  })

  it('keeps the issue link when an unrelated error shares the toast', () => {
    const view = render(
      React.createElement(TerminalErrorToast, {
        error: [MISSING_FOLDER_ERROR, 'Failed to spawn shell "/bin/zsh": boom'].join('\n'),
        onDismiss: vi.fn()
      })
    )

    const toast = view.container.querySelector('[data-terminal-error-toast]')
    expect(toast?.textContent).toContain('Orca cannot find /Users/me/ara_company')
    expect(toast?.querySelector('a')?.textContent).toBe('file an issue')
  })

  it('does not ask the user to file an issue for a folder they can fix', () => {
    const view = render(
      React.createElement(TerminalErrorToast, {
        error: MISSING_FOLDER_ERROR,
        onDismiss: vi.fn()
      })
    )

    const toast = view.container.querySelector('[data-terminal-error-toast]')
    expect(toast?.textContent).toContain('Orca cannot find /Users/me/ara_company')
    expect(toast?.textContent).not.toContain('folder_workspace_path_missing')
    expect(toast?.textContent).not.toContain('If this persists')
    expect(toast?.querySelector('a')).toBeNull()
  })
})
