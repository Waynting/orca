import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getOrcaUserDataPath, getSystemCodexHomePath } from './codex-home-paths'
import { assertOwnedHostCodexManagedHomePath } from '../codex-accounts/host-codex-managed-home-ownership'

/** Per-account self-contained host Codex homes present on disk that Orca owns.
 *  Why disk-enumerated, not settings-driven: homes retained after an account
 *  change still hold state, and CLI callers have no settings store. WSL
 *  account homes live inside their distro and are handled by their own lane. */
export function getOwnedCodexAccountHomePaths(): string[] {
  const accountsRoot = join(getOrcaUserDataPath(), 'codex-accounts')
  try {
    return readdirSync(accountsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const accountHome = join(accountsRoot, entry.name, 'home')
        try {
          assertOwnedHostCodexManagedHomePath({
            candidatePath: accountHome,
            managedAccountsRoot: accountsRoot,
            systemCodexHomePath: getSystemCodexHomePath(),
            expectedAccountId: entry.name
          })
          return [accountHome]
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}

/** Session roots of per-account self-contained host Codex homes present on disk. */
export function getCodexAccountHomeSessionDirectories(): string[] {
  return getOwnedCodexAccountHomePaths().flatMap((accountHome) => {
    const sessionsPath = join(accountHome, 'sessions')
    try {
      // Why: a redirected sessions root could make usage scan unrelated, unbounded trees.
      return lstatSync(sessionsPath).isDirectory() ? [sessionsPath] : []
    } catch {
      return []
    }
  })
}
