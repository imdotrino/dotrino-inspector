#!/usr/bin/env node
// Dotrino Inspector — se levanta con un comando (DISENO §2).
//
//   npx @dotrino/inspector [carpeta…]
//
// Ve, explica y sugiere. No edita, no mueve, no borra y no arranca nada (DISENO §4).
import { spawn } from 'node:child_process'
import { platform } from 'node:os'
import { createInspectorServer } from '../src/server.js'
import { scan, currentSystem } from '../src/scan/index.js'
import { recipeFor } from '../src/recipes.js'
import { finalSeverity, sortFindings, groupFindings } from '../src/severity.js'
import { load as loadState, applyDismissed } from '../src/state.js'

const argv = process.argv.slice(2)
const has = (...names) => names.some(n => argv.includes(n))
const valueOf = name => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const roots = argv.filter(a => !a.startsWith('-') && argv[argv.indexOf(a) - 1] !== '--port')

if (has('-h', '--help')) {
  console.log(`dotrino-inspector — qué credenciales tienes en claro en esta máquina

  npx @dotrino/inspector [carpeta…]     abre la UI en el escritorio
  npx @dotrino/inspector --print        el informe por la terminal, sin UI

  --port <n>      puerto del servidor local (por defecto, uno libre)
  --no-open       no abrir el navegador; imprime la dirección
  --no-known      no mirar las ubicaciones conocidas (~/.ssh, ~/.aws…)

Solo lee. No edita, no borra y no arranca servicios: te dice qué hacer y lo haces tú.`)
  process.exit(0)
}

if (has('--print')) await printReport()
else await serve()

async function printReport () {
  const system = currentSystem()
  const result = await scan({ roots, includeKnown: !has('--no-known') })
  const state = await loadState()
  const findings = sortFindings(
    applyDismissed(groupFindings(result.findings.map(f => ({ ...f, severity: finalSeverity(f) }))), state)
  ).filter(f => !f.dismissed)

  if (!findings.length) {
    console.log(`Nada en claro por aquí. ${result.scanned} archivos mirados.`)
    return
  }
  const mark = { high: '!!', medium: '! ', low: '  ' }
  console.log(`${findings.length} hallazgos · ${result.scanned} archivos mirados\n`)
  for (const f of findings) {
    const where = f.line ? `${f.file}:${f.line}` : f.file
    const extra = [f.count > 1 ? `${f.count}×` : f.key, ...(f.exposure || [])].filter(Boolean).join(' · ')
    console.log(`${mark[f.severity]} ${f.type.padEnd(22)} ${where}${extra ? '   (' + extra + ')' : ''}`)
  }
  const recipe = recipeFor(findings[0], system)
  if (recipe) {
    console.log(`\nPor ejemplo, para el primero — ${recipe.title.es}:`)
    for (const s of recipe.steps) if (s.code) console.log('   ' + s.code)
  }
  console.log('\nAbre la UI para verlos uno a uno con su receta:  npx @dotrino/inspector')
}

async function serve () {
  if (!hasDesktop()) {
    console.error(`This is a desktop tool: there is no graphical session here to open the UI in.
On a server, use the terminal report instead:  npx @dotrino/inspector --print`)
    process.exit(1)
  }

  const app = createInspectorServer()
  const addr = await app.listen(Number(valueOf('--port')) || 0)
  const url = `http://127.0.0.1:${addr.port}/?t=${app.launchToken}`

  console.log(`Dotrino Inspector on ${url}`)
  console.log('Only reads. Nothing leaves this machine. Ctrl+C closes it.')
  if (!has('--no-open')) openBrowser(url)

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => { await app.close(); process.exit(0) })
  }
}

// El servidor muere con el comando: no queda un demonio con los secretos de la máquina
// a un puerto de distancia (DISENO §2).
function hasDesktop () {
  const p = platform()
  if (p === 'win32' || p === 'darwin') return true
  return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
}

function openBrowser (url) {
  const p = platform()
  const [cmd, args] = p === 'darwin'
    ? ['open', [url]]
    : p === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]]
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
  } catch {
    console.log('Could not open a browser. Paste that address in yours.')
  }
}
