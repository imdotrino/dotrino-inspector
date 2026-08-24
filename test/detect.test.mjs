import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify, parseEnv, entropy, fingerprint, providerOf } from '../src/scan/detect.js'

test('no marca lo que no es un secreto', () => {
  for (const [k, v] of [
    ['PORT', '3000'], ['NODE_ENV', 'production'], ['API_URL', 'https://api.example.com'],
    ['DB_HOST', 'localhost'], ['SECRET', 'changeme'], ['TOKEN', '<your-token>'],
    ['PASSWORD', ''], ['DEBUG', 'true'], ['CONFIG_PATH', '/etc/app.conf'],
    ['PUBLIC_KEY_URL', 'https://x/y'], ['VERSION', '1.2.3']
  ]) assert.equal(classify(k, v), null, `${k}=${v} no debería ser un hallazgo`)
})

test('marca lo que sí lo es', () => {
  for (const [k, v] of [
    ['GITHUB_TOKEN', 'ghp_1234567890abcdefghij'],
    ['DB_PASSWORD', 'un-password-largo'],
    ['STRIPE_KEY', 'sk_live_abc123def456'],
    ['DATABASE_URL', 'postgres://user:s3cr3t@host/db'],
    ['CLIENT_SECRET', 'aZ39fk20dkQm38fkKKzz']
  ]) assert.ok(classify(k, v), `${k}=${v} debería ser un hallazgo`)
})

test('reconoce al proveedor por el prefijo', () => {
  assert.equal(providerOf('ghp_x'), 'GitHub')
  assert.equal(providerOf('AKIAIOSFODNN7EXAMPLE'), 'AWS')
  assert.equal(providerOf('hola'), null)
})

test('la huella no deja recuperar el valor', () => {
  const fp = fingerprint('ghp_supersecreto')
  assert.equal(fp.length, 8)
  assert.ok(!fp.includes('secreto'))
  assert.equal(fp, fingerprint('ghp_supersecreto'))
  assert.notEqual(fp, fingerprint('ghp_otro'))
})

test('la entropía distingue una palabra de un token', () => {
  assert.ok(entropy('aaaaaaaa') < 1)
  assert.ok(entropy('kJ8s2Nf9pQ3xLm7v') > 3.5)
})

test('parseEnv entiende export, comillas y comentarios', () => {
  const rows = parseEnv([
    '# comentario',
    'export A=1',
    'B = "con espacio" # no es parte',
    "C='simple'",
    'D=plain # cola',
    'no-es-una-linea'
  ].join('\n'))
  assert.deepEqual(rows.map(r => [r.key, r.value]), [
    ['A', '1'], ['B', 'con espacio'], ['C', 'simple'], ['D', 'plain']
  ])
})
