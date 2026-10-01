import { describe, expect, it } from 'vitest'
import type { FolderWorkspacePathStatus } from '../../../shared/folder-workspace-path-status'
import {
  formatFolderWorkspaceCreateError,
  getFolderWorkspacePathErrorCopy,
  getFolderWorkspacePathStatusDescription,
  getFolderWorkspacePathStatusTitle
} from './folder-workspace-path-status'

// Why: the status crosses the runtime RPC wire and is cast, not decoded (`result: z.unknown()`), so
// the cast at the test boundary is the point — a newer host really can put these on the wire.
function wireStatus(reason: unknown): FolderWorkspacePathStatus {
  return { path: '/srv/scans', exists: false, reason } as unknown as FolderWorkspacePathStatus
}

describe('getFolderWorkspacePathStatusTitle', () => {
  it('keeps the declared reasons on their own copy', () => {
    expect(getFolderWorkspacePathStatusTitle(wireStatus('missing'))).toBe('Folder not found')
    expect(getFolderWorkspacePathStatusTitle(wireStatus('not-directory'))).toBe(
      'Path is not a folder'
    )
    expect(getFolderWorkspacePathStatusTitle(wireStatus('ambiguous-connection'))).toBe(
      'Cannot determine connection'
    )
    expect(getFolderWorkspacePathStatusTitle(wireStatus('unavailable'))).toBe('Cannot check folder')
    expect(getFolderWorkspacePathStatusTitle(wireStatus(undefined))).toBe('Cannot check folder')
  })

  it('still titles a broken folder when a newer host sends an undeclared reason', () => {
    const title = getFolderWorkspacePathStatusTitle(wireStatus('permission-denied'))

    expect(typeof title).toBe('string')
    expect(title).not.toBe('')
  })

  // Why: Object.hasOwn coerces its key, so ['missing'] passes a hasOwn-only guard and then falls
  // straight back out of the switch — the exact P1 found in review on #15002.
  it('does not admit a non-string reason through the membership guard', () => {
    const title = getFolderWorkspacePathStatusTitle(wireStatus(['missing']))

    expect(typeof title).toBe('string')
    expect(title).not.toBe('')
    expect(title).not.toBe('Folder not found')
  })

  it('stays silent for a healthy or absent status', () => {
    expect(getFolderWorkspacePathStatusTitle(null)).toBeNull()
    expect(getFolderWorkspacePathStatusTitle({ path: '/srv/scans', exists: true })).toBeNull()
  })
})

describe('getFolderWorkspacePathStatusDescription', () => {
  it('keeps the declared reasons on their own copy', () => {
    expect(getFolderWorkspacePathStatusDescription(wireStatus('missing'))).toBe(
      'Orca cannot find /srv/scans. Remove and re-import this folder workspace.'
    )
    expect(getFolderWorkspacePathStatusDescription(wireStatus(undefined))).toBe(
      'Orca cannot verify this folder right now. Check the runtime or SSH connection and try again.'
    )
  })

  it('still describes a broken folder when a newer host sends an undeclared reason', () => {
    const description = getFolderWorkspacePathStatusDescription(wireStatus('permission-denied'))

    expect(typeof description).toBe('string')
    expect(description).not.toBe('')
    expect(description).toContain('/srv/scans')
  })

  it('does not admit a non-string reason through the membership guard', () => {
    const description = getFolderWorkspacePathStatusDescription(wireStatus(['missing']))

    expect(typeof description).toBe('string')
    expect(description).not.toBe('')
    expect(description).not.toBe(
      'Orca cannot find /srv/scans. Remove and re-import this folder workspace.'
    )
  })
})

describe('getFolderWorkspacePathErrorCopy', () => {
  it('maps each main-process path error code to its own copy', () => {
    expect(getFolderWorkspacePathErrorCopy('folder_workspace_path_missing:/srv/scans')).toEqual({
      title: 'Folder not found',
      description: 'Orca cannot find /srv/scans. Remove and re-import the folder.'
    })
    expect(
      getFolderWorkspacePathErrorCopy('folder_workspace_path_not_directory:/srv/scans')?.title
    ).toBe('Path is not a folder')
    expect(
      getFolderWorkspacePathErrorCopy('folder_workspace_connection_ambiguous:/srv/scans')?.title
    ).toBe('Cannot determine connection')
    expect(
      getFolderWorkspacePathErrorCopy('folder_workspace_path_unavailable:/srv/scans')?.title
    ).toBe('Cannot check folder')
  })

  it('finds the code behind an Electron IPC prefix and keeps paths with spaces', () => {
    const copy = getFolderWorkspacePathErrorCopy(
      "Error invoking remote method 'pty:spawn': Error: folder_workspace_path_missing:/Users/me/My Project"
    )

    expect(copy?.description).toBe(
      'Orca cannot find /Users/me/My Project. Remove and re-import the folder.'
    )
  })

  it('returns null for unrelated errors', () => {
    expect(getFolderWorkspacePathErrorCopy('folder_workspace_not_found')).toBeNull()
    expect(getFolderWorkspacePathErrorCopy('Failed to spawn shell')).toBeNull()
  })
})

describe('formatFolderWorkspaceCreateError', () => {
  it('uses the path copy for path codes and the raw message otherwise', () => {
    expect(
      formatFolderWorkspaceCreateError(new Error('folder_workspace_path_missing:/srv/app')).title
    ).toBe('Folder not found')
    expect(formatFolderWorkspaceCreateError(new Error('disk full'))).toEqual({
      title: 'Failed to create folder workspace',
      description: 'disk full'
    })
  })
})
