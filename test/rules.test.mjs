import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectFile } from '../src/scan/index.js'
import { scan } from '../src/scan/index.js'

const box = async () => mkdtemp(join(tmpdir(), 'inspector-test-'))

test('un .env con un secreto da un hallazgo, y el valor NO viaja', async () => {
  const dir = await box()
  const file = join(dir, '.env')
  await writeFile(file, 'PORT=3000\nGITHUB_TOKEN=ghp_1234567890abcdefghij\n')
  const [f, ...rest] = await inspectFile(file)
  assert.equal(rest.length, 0, 'PORT no debería salir')
  assert.equal(f.type, 'dotenv')
  assert.equal(f.key, 'GITHUB_TOKEN')
  assert.equal(f.line, 2)
  assert.equal(f.provider, 'GitHub')
  assert.ok(!JSON.stringify(f).includes('ghp_1234567890abcdefghij'), 'el valor no puede viajar en el hallazgo')
})

test('distingue una llave SSH con frase de una sin frase', async () => {
  const dir = await box()
  const sinFrase = join(dir, 'id_test')
  const conFrase = join(dir, 'id_pem')
  await writeFile(sinFrase, [
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    Buffer.concat([
      Buffer.from('openssh-key-v1\0', 'latin1'),
      Buffer.from([0, 0, 0, 4]), Buffer.from('none')
    ]).toString('base64'),
    '-----END OPENSSH PRIVATE KEY-----'
  ].join('\n'))
  await writeFile(conFrase, [
    '-----BEGIN RSA PRIVATE KEY-----',
    'Proc-Type: 4,ENCRYPTED',
    'DEK-Info: AES-128-CBC,0123',
    '', 'abcd', '-----END RSA PRIVATE KEY-----'
  ].join('\n'))
  const [a] = await inspectFile(sinFrase)
  const [b] = await inspectFile(conFrase)
  assert.equal(a.type, 'ssh-key-unencrypted')
  assert.equal(a.severity, 'high')
  assert.equal(b.type, 'ssh-private-key')
})

test('ve los permisos abiertos', { skip: process.platform === 'win32' }, async () => {
  const dir = await box()
  const file = join(dir, '.env')
  await writeFile(file, 'API_SECRET=abcdefghijklmnop\n')
  await chmod(file, 0o644)
  const [f] = await inspectFile(file)
  assert.ok(f.exposure.includes('world-readable'))
  await chmod(file, 0o600)
  const [g] = await inspectFile(file)
  assert.ok(!g.exposure.includes('world-readable'))
})

test('el recorrido no se mete en node_modules ni sigue enlaces', async () => {
  const dir = await box()
  await mkdir(join(dir, 'node_modules', 'x'), { recursive: true })
  await writeFile(join(dir, 'node_modules', 'x', '.env'), 'API_SECRET=abcdefghijklmnop\n')
  await writeFile(join(dir, '.env'), 'API_SECRET=abcdefghijklmnop\n')
  const { findings } = await scan({ roots: [dir], includeKnown: false })
  assert.equal(findings.length, 1)
  assert.ok(!findings[0].file.includes('node_modules'))
})

test('no lee archivos binarios ni enormes', async () => {
  const dir = await box()
  const file = join(dir, 'app.key')
  await writeFile(file, Buffer.from([0, 1, 2, 3, 0, 0]))
  assert.deepEqual(await inspectFile(file), [])
})
