// El recorrido. Solo lectura: el Inspector abre archivos para mirarlos y nada más
// (DISENO §4.1).
import { readdir, readFile, stat, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, dirname, resolve, basename, relative, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { rules } from '../rules.js'
import { currentSystem, knownLocations, SKIP_DIRS } from './locations.js'

const run = promisify(execFile)

const MAX_BYTES = 2 * 1024 * 1024   // más grande que esto no es un archivo de configuración
const BINARY_EXT = new Set(['.jks', '.p12', '.pfx', '.keystore', '.png', '.jpg', '.jpeg',
  '.gif', '.pdf', '.zip', '.gz', '.xz', '.tar', '.mp4', '.mp3', '.woff', '.woff2', '.ico',
  '.so', '.dylib', '.dll', '.exe', '.node', '.wasm', '.class', '.jar', '.apk', '.aab'])

/** Archivos que vale la pena abrir: los que alguna regla podría reclamar. */
const CANDIDATE = [
  /(?:^|[\\/])\.env(?:\.[\w.-]+)?$/i,
  /\.env$/i,
  /(?:^|[\\/])\.npmrc$/,
  /(?:^|[\\/])\.netrc$/, /(?:^|[\\/])_netrc$/, /(?:^|[\\/])\.pgpass$/,
  /(?:^|[\\/])\.git-credentials$/,
  /(?:^|[\\/])hosts\.ya?ml$/,
  /(?:^|[\\/])credentials$/,
  /(?:^|[\\/])config(?:\.json)?$/,
  /(?:^|[\\/])kubeconfig$/,
  /application_default_credentials\.json$/,
  /(?:^|[\\/])google-services\.json$/,
  /(?:^|[\\/])keystore\.properties$/,
  /\.(?:jks|p12|pfx|keystore)$/i,
  /(?:^|[\\/])id_[a-z0-9]+$/i,
  /\.pem$/i, /\.key$/i,
  /(?:^|[\\/])\.(?:bash|zsh)_history$/,
  /(?:^|[\\/])ConsoleHost_history\.txt$/
]

// Dentro de una carpeta de credenciales todo es candidato: ahí las llaves no llevan
// extensión ni un nombre previsible (`closerclick_ed25519`, `work`, `deploy`).
const CRED_DIR = /[\\/](?:\.ssh|\.aws|\.kube|\.docker|gcloud|GitHub CLI|gh)[\\/]/i
const NOT_SECRET_FILE = /\.(?:pub|md|txt|log|lock|old|bak|sock)$|^known_hosts|^authorized_keys/

const isCandidate = f =>
  CANDIDATE.some(re => re.test(f)) ||
  (CRED_DIR.test(f) && !NOT_SECRET_FILE.test(basename(f)))

export async function readIfText (file) {
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
  if (BINARY_EXT.has(ext)) return null
  try {
    const st = await stat(file)
    if (!st.isFile() || st.size > MAX_BYTES) return null
    const buf = await readFile(file)
    // Un NUL en los primeros bytes = binario; no se intenta interpretar.
    if (buf.subarray(0, 4096).includes(0)) return null
    return buf.toString('utf8')
  } catch { return null }
}

/** Un archivo contra todas las reglas del sistema actual. */
export async function inspectFile (file, system = currentSystem()) {
  if (!isCandidate(file)) return []
  const text = await readIfText(file)
  const ctx = { file, text, system }
  const found = []
  for (const rule of rules) {
    if (!rule.systems.includes(system)) continue
    try { found.push(...rule.match(ctx)) } catch { /* una regla rota no tumba el recorrido */ }
  }
  if (!found.length) return []
  const context = await fileContext(file, system)
  return found.map(f => ({ ...f, ...context, id: `${f.type}:${f.file}:${f.line || 0}:${f.fingerprint}` }))
}

/** Lo que rodea al archivo y agrava (o no) el hallazgo: permisos y git. */
async function fileContext (file, system) {
  const out = { exposure: [] }
  try {
    const st = await stat(file)
    if (system !== 'win32') {
      const mode = st.mode & 0o777
      // Otros usuarios de la máquina pueden leerlo. El grupo también cuenta: en un
      // equipo compartido «el grupo» no eres solo tú.
      if (mode & 0o044) out.exposure.push('world-readable')
      out.mode = mode.toString(8).padStart(3, '0')
    }
  } catch { /* ya no está */ }

  const git = await gitState(file)
  if (git.tracked) out.exposure.push('tracked-by-git')
  else if (git.ignored) out.exposure.push('ignored-but-present')
  if (git.repo) out.repo = git.repo
  return out
}

const gitCache = new Map()

async function gitState (file) {
  const dir = dirname(file)
  if (!gitCache.has(dir)) gitCache.set(dir, findRepo(dir))
  const repo = await gitCache.get(dir)
  if (!repo) return { tracked: false, ignored: false, repo: null }
  const rel = relative(repo, file)
  const tracked = await gitSays(repo, ['ls-files', '--error-unmatch', '--', rel])
  const ignored = tracked ? false : await gitSays(repo, ['check-ignore', '-q', '--', rel])
  return { tracked, ignored, repo }
}

async function findRepo (dir) {
  let d = resolve(dir)
  for (;;) {
    try { await access(join(d, '.git'), constants.F_OK); return d } catch { /* sigue */ }
    const up = dirname(d)
    if (up === d) return null
    d = up
  }
}

async function gitSays (cwd, args) {
  try { await run('git', args, { cwd, timeout: 5000 }); return true } catch { return false }
}

/**
 * Recorre y devuelve los hallazgos. `onProgress` recibe la ruta que se está mirando.
 * Nunca lanza por un archivo suelto: un permiso denegado se salta, no corta el recorrido.
 */
export async function scan ({ roots = [], includeKnown = true, maxDepth = 8, onProgress, signal } = {}) {
  const system = currentSystem()
  const findings = []
  const seen = new Set()
  const targets = []

  if (includeKnown) {
    for (const loc of knownLocations(system)) targets.push({ path: loc.path, depth: loc.depth })
  }
  for (const r of roots) targets.push({ path: resolve(r), depth: maxDepth })

  for (const t of targets) {
    await walk(t.path, t.depth)
  }
  return { system, findings, scanned: seen.size }

  async function walk (path, depth) {
    if (signal?.aborted) return
    if (seen.has(path)) return
    let st
    try { st = await stat(path) } catch { return }

    if (st.isFile()) {
      seen.add(path)
      onProgress?.(path)
      const hits = await inspectFile(path, system)
      for (const h of hits) if (!findings.some(f => f.id === h.id)) findings.push(h)
      return
    }
    if (!st.isDirectory() || depth < 0) return
    if (SKIP_DIRS.has(basename(path))) return

    let entries
    try { entries = await readdir(path, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (signal?.aborted) return
      const full = join(path, e.name)
      if (e.isSymbolicLink()) continue          // no se siguen enlaces: se vuelve en círculos
      if (e.isDirectory()) await walk(full, depth - 1)
      else if (e.isFile()) await walk(full, 0)
    }
  }
}

export { currentSystem, knownLocations }
export const pathSep = sep
