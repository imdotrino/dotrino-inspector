// Ventana propia para la UI (DISENO §2): el Inspector es una herramienta de
// escritorio, no una pestaña más entre veinte. Se abre en modo aplicación de
// Chromium (`--app=`), que da una ventana sin barra de direcciones ni pestañas.
//
// Por qué así y no con un webview nativo o Electron: esto se ejecuta con `npx`,
// y CONVENCIONES §1.1 obliga a `ignore-scripts=true`, así que un binding nativo
// con prebuild por postinstall no llegaría a instalarse en la máquina del
// usuario. El navegador ya está ahí; no se descarga nada.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { tmpdir, platform } from 'node:os'

const LINUX_BINARIES = [
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
  'brave-browser', 'microsoft-edge', 'microsoft-edge-stable', 'vivaldi'
]

const MAC_APPS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
]

const WIN_APPS = [
  'Google\\Chrome\\Application\\chrome.exe',
  'Microsoft\\Edge\\Application\\msedge.exe',
  'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  'Chromium\\Application\\chrome.exe'
]

/** Primer navegador basado en Chromium que exista en esta máquina, o null. */
export function findChromium () {
  const p = platform()
  if (p === 'darwin') return MAC_APPS.find(existsSync) || null
  if (p === 'win32') {
    const bases = [
      process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs'),
      process.env.LOCALAPPDATA
    ].filter(Boolean)
    for (const base of bases) {
      for (const rel of WIN_APPS) {
        const full = join(base, rel)
        if (existsSync(full)) return full
      }
    }
    return null
  }
  for (const bin of LINUX_BINARIES) {
    const full = inPath(bin)
    if (full) return full
  }
  return null
}

function inPath (bin) {
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue
    const full = join(dir, bin)
    if (existsSync(full)) return full
  }
  return null
}

/**
 * Abre la UI en su propia ventana. Devuelve el proceso hijo, o null si no hay
 * ningún Chromium instalado (quien llama cae entonces al navegador normal).
 *
 * El perfil es temporal y se borra al cerrar: la ventana no hereda extensiones
 * ni sesiones del usuario, y esta herramienta enseña secretos en pantalla.
 */
export function openAppWindow (url, { width = 1180, height = 860 } = {}) {
  const browser = findChromium()
  if (!browser) return null

  let profile
  try {
    profile = mkdtempSync(join(tmpdir(), 'dotrino-inspector-'))
    // En Linux el WM agrupa por WM_CLASS: sin esto la ventana aparece como
    // «Google Chrome» en el conmutador de tareas y no como el Inspector.
    const linuxClass = platform() === 'linux' ? ['--class=dotrino-inspector'] : []

    const child = spawn(browser, [
      `--app=${url}`,
      ...linuxClass,
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--new-window'
    ], { stdio: 'ignore' })

    child.on('error', () => cleanup(profile))
    child.on('exit', () => cleanup(profile))
    return child
  } catch {
    if (profile) cleanup(profile)
    return null
  }
}

function cleanup (dir) {
  try { rmSync(dir, { recursive: true, force: true }) } catch {}
}
