// El servidor local. Es la superficie de ataque de la herramienta, así que va acotado
// desde la primera línea (DISENO §2):
//   · escucha SOLO en 127.0.0.1;
//   · el token de la URL es de un solo uso: se canjea por uno de sesión y se invalida;
//   · muere con el comando.
import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, extname, resolve, normalize } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { scan, currentSystem, knownLocations } from './scan/index.js'
import { recipeFor, exposureNote } from './recipes.js'
import { load as loadState, dismiss, undismiss, applyDismissed } from './state.js'
import { finalSeverity, sortFindings, groupFindings } from './severity.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const WEB = resolve(here, '..', 'web', 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
}

const eq = (a, b) => {
  const A = Buffer.from(String(a)); const B = Buffer.from(String(b))
  return A.length === B.length && timingSafeEqual(A, B)
}

export function createInspectorServer () {
  let launchToken = randomBytes(24).toString('hex')
  let launchUsed = false
  const sessions = new Set()

  const authed = req => {
    const h = req.headers.authorization || ''
    const m = /^Bearer\s+(\S+)$/.exec(h)
    return !!m && [...sessions].some(s => eq(s, m[1]))
  }

  const server = createServer(async (req, res) => {
    // Solo desde esta máquina. El bind ya lo garantiza; esto es el cinturón.
    const ip = req.socket.remoteAddress || ''
    if (!/^(::1|::ffff:127\.|127\.)/.test(ip)) return end(res, 403, { error: 'local only' })

    // Nada de páginas ajenas hablándole al servidor desde el navegador del usuario.
    const origin = req.headers.origin
    if (origin && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(origin)) {
      return end(res, 403, { error: 'bad origin' })
    }

    const url = new URL(req.url, 'http://127.0.0.1')
    const path = url.pathname

    try {
      if (path === '/api/session' && req.method === 'POST') {
        const body = await readBody(req)
        if (launchUsed || !eq(launchToken, body.t || '')) {
          return end(res, 401, { error: 'invalid or already used launch token' })
        }
        launchUsed = true                 // de un solo uso, de verdad
        launchToken = ''
        const token = randomBytes(24).toString('hex')
        sessions.add(token)
        return end(res, 200, { token })
      }

      if (path.startsWith('/api/')) {
        if (!authed(req)) return end(res, 401, { error: 'unauthorized' })

        if (path === '/api/context') {
          const system = currentSystem()
          return end(res, 200, {
            system,
            home: homedir(),
            version: await version(),
            known: knownLocations(system).map(l => l.path)
          })
        }

        if (path === '/api/scan') return sse(req, res, url)

        if (path === '/api/dismiss' && req.method === 'POST') {
          const b = await readBody(req)
          return end(res, 200, await dismiss(b.id, b.reason || ''))
        }
        if (path === '/api/undismiss' && req.method === 'POST') {
          const b = await readBody(req)
          return end(res, 200, await undismiss(b.id))
        }
        return end(res, 404, { error: 'not found' })
      }

      return await serveStatic(path, res)
    } catch (err) {
      end(res, 500, { error: String(err && err.message || err) })
    }
  })

  // El recorrido puede tardar: se manda el progreso según pasa, no un silencio de un minuto.
  async function sse (req, res, url) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive'
    })
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    const controller = new AbortController()
    req.on('close', () => controller.abort())

    const roots = (url.searchParams.get('roots') || '').split('\n').map(s => s.trim()).filter(Boolean)
    const includeKnown = url.searchParams.get('known') !== '0'

    let last = 0
    try {
      const result = await scan({
        roots,
        includeKnown,
        signal: controller.signal,
        onProgress (file) {
          const now = Date.now()
          if (now - last < 80) return          // no se inunda al navegador
          last = now
          send('progress', { file })
        }
      })
      const state = await loadState()
      const graded = result.findings.map(f => ({ ...f, severity: finalSeverity(f) }))
      const findings = sortFindings(
        applyDismissed(groupFindings(graded), state).map(f => ({
          ...f,
          recipe: recipeFor(f, result.system),
          notes: (f.exposure || []).map(exposureNote).filter(Boolean)
        }))
      )
      send('done', { system: result.system, scanned: result.scanned, findings })
    } catch (err) {
      send('failed', { error: String(err && err.message || err) })
    }
    res.end()
  }

  async function serveStatic (path, res) {
    const rel = path === '/' ? 'index.html' : normalize(path).replace(/^([/\\.]+)/, '')
    const full = join(WEB, rel)
    if (!full.startsWith(WEB)) return end(res, 403, { error: 'nope' })
    try {
      const buf = await readFile(full)
      res.writeHead(200, {
        'content-type': MIME[extname(full).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
        // La UI no carga nada de fuera y nadie la puede enmarcar.
        'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer'
      })
      res.end(buf)
    } catch {
      if (rel === 'index.html') {
        return end(res, 500, { error: 'the UI is not built: run `npm run build` in web/' })
      }
      end(res, 404, { error: 'not found' })
    }
  }

  return {
    server,
    get launchToken () { return launchToken },
    listen (port = 0) {
      return new Promise(resolve => {
        server.listen(port, '127.0.0.1', () => resolve(server.address()))
      })
    },
    close () { return new Promise(r => server.close(r)) }
  }
}

function end (res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

async function readBody (req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > 1e6) throw new Error('body too large')
    chunks.push(c)
  }
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return {} }
}

async function version () {
  try {
    const pkg = JSON.parse(await readFile(resolve(here, '..', 'package.json'), 'utf8'))
    return pkg.version
  } catch { return '0.0.0' }
}
