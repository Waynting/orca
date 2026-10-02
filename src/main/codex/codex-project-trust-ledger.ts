import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isDefinitiveAbsence } from '../../shared/definitive-filesystem-absence'
import { resolveOrcaManagedCodexHomePath } from './codex-home-paths'

// Why (#24697): Codex keeps a project's trust forever, so Orca records which
// `[projects."<path>"]` tables its pre-trust created, per config.toml. Only
// these may be removed when the workspace goes; a table that existed before
// belongs to the user.

/** Config.toml path → project paths whose tables Orca created there. */
export type CodexProjectTrustLedger = Record<string, string[]>

type CodexProjectTrustLedgerFile = {
  version: 1
  configs: CodexProjectTrustLedger
}

export function getCodexProjectTrustLedgerPath(): string {
  return join(dirname(resolveOrcaManagedCodexHomePath()), 'project-trust-ledger.json')
}

/** `null` means the ledger could not be read; writes must not replace it with a partial one. */
function readLedgerFileOrNull(ledgerPath: string): CodexProjectTrustLedgerFile | null {
  let raw: string
  try {
    raw = readFileSync(ledgerPath, 'utf-8')
  } catch (error) {
    return isDefinitiveAbsence(error) ? { version: 1, configs: {} } : null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'version' in parsed &&
      parsed.version === 1 &&
      'configs' in parsed
    ) {
      return { version: 1, configs: sanitizeConfigs(parsed.configs) }
    }
  } catch {
    // Fall through: a corrupt ledger only means older entries are never removed.
  }
  return { version: 1, configs: {} }
}

function sanitizeConfigs(value: unknown): CodexProjectTrustLedger {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const configs: CodexProjectTrustLedger = {}
  for (const [configPath, paths] of Object.entries(value)) {
    if (Array.isArray(paths)) {
      const strings = paths.filter((path): path is string => typeof path === 'string')
      if (strings.length > 0) {
        configs[configPath] = strings
      }
    }
  }
  return configs
}

function persistLedgerFile(ledgerPath: string, file: CodexProjectTrustLedgerFile): void {
  mkdirSync(dirname(ledgerPath), { recursive: true, mode: 0o700 })
  writeFileSync(ledgerPath, `${JSON.stringify(file, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600
  })
}

export function readCodexProjectTrustLedger(
  ledgerPath = getCodexProjectTrustLedgerPath()
): CodexProjectTrustLedger {
  return readLedgerFileOrNull(ledgerPath)?.configs ?? {}
}

export function recordCodexProjectTrustCreated(
  configPath: string,
  projectPath: string,
  ledgerPath = getCodexProjectTrustLedgerPath()
): void {
  const file = readLedgerFileOrNull(ledgerPath)
  if (!file) {
    return
  }
  const paths = file.configs[configPath] ?? []
  if (paths.includes(projectPath)) {
    return
  }
  file.configs[configPath] = [...paths, projectPath]
  persistLedgerFile(ledgerPath, file)
}

export function forgetCodexProjectTrust(
  configPath: string,
  projectPaths: readonly string[],
  ledgerPath = getCodexProjectTrustLedgerPath()
): void {
  const file = readLedgerFileOrNull(ledgerPath)
  const paths = file?.configs[configPath]
  if (!file || !paths) {
    return
  }
  const kept = paths.filter((path) => !projectPaths.includes(path))
  if (kept.length === paths.length) {
    return
  }
  if (kept.length === 0) {
    delete file.configs[configPath]
  } else {
    file.configs[configPath] = kept
  }
  persistLedgerFile(ledgerPath, file)
}
