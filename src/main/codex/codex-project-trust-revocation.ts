import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import { getOwnedCodexAccountHomePaths } from './codex-account-home-discovery'
import { getSystemCodexHomePath, resolveOrcaManagedCodexHomePath } from './codex-home-paths'
import { forgetCodexProjectTrust, readCodexProjectTrustLedger } from './codex-project-trust-ledger'
import { runExclusivelyForCodexTrustConfig } from './codex-trust-config-mutation-queue'
import { hasProjectTrustTable } from './config-toml-project-trust'
import { removeOrcaWrittenProjectTrustTables } from './config-toml-project-trust-removal'
import { writeConfigAtomically } from './config-toml-trust'

export type CodexProjectTrustRevocation = {
  /** The removed workspace's root; trust Orca wrote for it or any folder below is revoked. */
  removedRoot: string
  /** Roots of workspaces that remain; one at or below `removedRoot` keeps its own trust. */
  remainingRoots: readonly string[]
}

/**
 * Removes the Codex project trust Orca's pre-trust created for a removed local
 * workspace (#24697), then the copies the config mirror carried into each
 * managed account home. Only ledgered tables still in Orca's exact shape go.
 */
export async function revokeCodexProjectTrustForRemovedWorkspace(
  revocation: CodexProjectTrustRevocation
): Promise<void> {
  const removedForms = withCanonicalForm(revocation.removedRoot)
  const isUnderRemovedRoot = (path: string): boolean =>
    removedForms.some((root) => isPathInsideOrEqual(root, path))
  // Why: an enclosing workspace (a repo holding `.worktrees/x`) must not shield x's trust.
  const keptRoots = revocation.remainingRoots.flatMap(withCanonicalForm).filter(isUnderRemovedRoot)
  const isRevoked = (projectPath: string): boolean =>
    isUnderRemovedRoot(projectPath) &&
    !keptRoots.some((root) => isPathInsideOrEqual(root, projectPath))

  const revokedPaths: string[] = []
  for (const [configFile, ledgeredPaths] of Object.entries(readCodexProjectTrustLedger())) {
    const candidates = ledgeredPaths.filter(isRevoked)
    if (candidates.length === 0) {
      continue
    }
    const removed = await removeTables(configFile, (path) => candidates.includes(path))
    revokedPaths.push(...removed)
    // Why: a table the user changed since is theirs now; stop tracking it either way.
    forgetCodexProjectTrust(configFile, candidates)
  }
  if (revokedPaths.length === 0) {
    return
  }
  // Why: the mirror copies source tables into account homes; a path some source still trusts stays.
  const sourceFiles = [
    join(resolveOrcaManagedCodexHomePath(), 'config.toml'),
    join(getSystemCodexHomePath(), 'config.toml')
  ]
  const mirroredPaths = revokedPaths.filter(
    (path) => !sourceFiles.some((file) => hasProjectTrustTable(readConfigOrEmpty(file), path))
  )
  if (mirroredPaths.length === 0) {
    return
  }
  for (const accountHome of getOwnedCodexAccountHomePaths()) {
    await removeTables(join(accountHome, 'config.toml'), (path) => mirroredPaths.includes(path))
  }
}

function removeTables(
  configFile: string,
  shouldRemove: (projectPath: string) => boolean
): Promise<string[]> {
  return runExclusivelyForCodexTrustConfig(configFile, async () => {
    if (!existsSync(configFile)) {
      return []
    }
    const existing = readFileSync(configFile, 'utf-8')
    const result = removeOrcaWrittenProjectTrustTables(existing, shouldRemove)
    if (result.content !== existing) {
      writeConfigAtomically(configFile, result.content)
    }
    return result.removedPaths
  })
}

function readConfigOrEmpty(configFile: string): string {
  try {
    return readFileSync(configFile, 'utf-8')
  } catch {
    return ''
  }
}

// Why: pre-trust stores realpaths, and a removed checkout can no longer be realpath'd itself.
function withCanonicalForm(path: string): string[] {
  try {
    if (existsSync(path)) {
      return [path, realpathSync.native(path)]
    }
    return [path, join(realpathSync.native(dirname(path)), basename(path))]
  } catch {
    return [path]
  }
}
