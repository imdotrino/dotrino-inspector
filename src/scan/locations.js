// Dónde mira el Inspector en cada sistema. Cada ubicación declara los sistemas en los
// que aplica, para que el catálogo no tenga que saber de rutas (DISENO §3).
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

/** @typedef {'linux'|'darwin'|'win32'} System */

export function currentSystem () {
  const p = platform()
  return p === 'darwin' ? 'darwin' : p === 'win32' ? 'win32' : 'linux'
}

const home = () => homedir()

// Ojo: el Llavero de macOS y el Administrador de credenciales de Windows NO están aquí
// a propósito. Ahí el secreto está bien guardado (cifrado por el sistema) y marcarlo
// sería el ruido que enseña a ignorar la herramienta (DISENO §3).
export function knownLocations (system = currentSystem()) {
  const h = home()
  const all = [
    { path: join(h, '.ssh'), systems: ['linux', 'darwin', 'win32'], depth: 1 },
    { path: join(h, '.aws'), systems: ['linux', 'darwin', 'win32'], depth: 1 },
    { path: join(h, '.config', 'gcloud'), systems: ['linux', 'darwin'], depth: 2 },
    { path: join(h, '.kube'), systems: ['linux', 'darwin', 'win32'], depth: 1 },
    { path: join(h, '.docker'), systems: ['linux', 'darwin', 'win32'], depth: 1 },
    { path: join(h, '.config', 'gh'), systems: ['linux', 'darwin'], depth: 2 },
    { path: join(h, 'AppData', 'Roaming', 'GitHub CLI'), systems: ['win32'], depth: 2 },
    { path: join(h, '.npmrc'), systems: ['linux', 'darwin', 'win32'], depth: 0 },
    { path: join(h, '.netrc'), systems: ['linux', 'darwin'], depth: 0 },
    { path: join(h, '_netrc'), systems: ['win32'], depth: 0 },
    { path: join(h, '.pgpass'), systems: ['linux', 'darwin'], depth: 0 },
    { path: join(h, '.git-credentials'), systems: ['linux', 'darwin', 'win32'], depth: 0 },
    { path: join(h, '.bash_history'), systems: ['linux', 'darwin'], depth: 0 },
    { path: join(h, '.zsh_history'), systems: ['linux', 'darwin'], depth: 0 },
    {
      path: join(h, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'PowerShell',
        'PSReadLine', 'ConsoleHost_history.txt'),
      systems: ['win32'],
      depth: 0
    }
  ]
  return all.filter(l => l.systems.includes(system))
}

// Carpetas que no se recorren nunca: ni tienen secretos del usuario ni acabaríamos.
export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor',
  '.cache', '.npm', '.pnpm-store', '.yarn', '.venv', 'venv', '__pycache__',
  '.next', '.nuxt', '.svelte-kit', 'Library', 'AppData', '.Trash',
  '.gradle', '.m2', 'Pods', 'DerivedData'
])
