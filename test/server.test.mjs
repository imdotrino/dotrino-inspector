// Las invariantes de seguridad del DISENO §5, cada una como un test: lo que no es un
// test, no es una invariante.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createInspectorServer } from '../src/server.js'

let app, base, launch
before(async () => {
  app = createInspectorServer()
  launch = app.launchToken
  const a = await app.listen(0)
  base = `http://127.0.0.1:${a.port}`
})
after(() => app.close())

const post = (p, body, token) => fetch(base + p, {
  method: 'POST',
  headers: token ? { authorization: 'Bearer ' + token } : {},
  body: JSON.stringify(body || {})
})

test('escucha solo en 127.0.0.1', () => {
  assert.equal(app.server.address().address, '127.0.0.1')
})

test('sin token no se responde a nada de la API', async () => {
  assert.equal((await fetch(base + '/api/context')).status, 401)
  assert.equal((await post('/api/dismiss', { id: 'x' })).status, 401)
})

test('el token de la URL es de UN SOLO USO', async () => {
  const first = await post('/api/session', { t: launch })
  assert.equal(first.status, 200)
  const { token } = await first.json()
  assert.ok(token)
  const second = await post('/api/session', { t: launch })
  assert.equal(second.status, 401, 'el segundo canje del mismo token tiene que fallar')
  // y el de sesión sí sirve
  assert.equal((await fetch(base + '/api/context', { headers: { authorization: 'Bearer ' + token } })).status, 200)
})

test('una página de otro origen no puede hablarle', async () => {
  const r = await fetch(base + '/api/context', { headers: { origin: 'https://evil.example' } })
  assert.equal(r.status, 403)
})

test('un token inventado no vale', async () => {
  const r = await fetch(base + '/api/context', { headers: { authorization: 'Bearer ' + 'a'.repeat(48) } })
  assert.equal(r.status, 401)
})

test('la página se sirve con una CSP que le impide hablar con nadie de fuera', async () => {
  // Es la invariante del DISENO §5.1 en su forma comprobable: aunque alguien metiera
  // código para llamar a un servidor, el navegador no le dejaría.
  const r = await fetch(base + '/')
  const csp = r.headers.get('content-security-policy') || ''
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /connect-src 'self'/)
  assert.match(csp, /frame-ancestors 'none'/)
})
