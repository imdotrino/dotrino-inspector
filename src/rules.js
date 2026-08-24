// El catálogo de hallazgos (DISENO §3). Cada regla es un módulo con `match()`: se puede
// añadir un tipo sin tocar la UI ni el flujo.
//
// Contrato de un hallazgo:
//   { type, file, line?, key?, fingerprint, provider?, severity, why: {es,en} }
// El VALOR del secreto no viaja nunca (DISENO §5.3).
import { basename, extname } from 'node:path'
import { classify, fingerprint, parseEnv, providerOf } from './scan/detect.js'

const ALL = ['linux', 'darwin', 'win32']

const isEnvFile = f => {
  const b = basename(f)
  return b === '.env' || b.startsWith('.env.') || b.endsWith('.env')
}

/** @type {Array<{type:string, systems:string[], match:(ctx)=>Array}>} */
export const rules = [
  {
    type: 'dotenv',
    systems: ALL,
    match ({ file, text }) {
      if (!isEnvFile(file) || text == null) return []
      const out = []
      for (const { key, value, line } of parseEnv(text)) {
        const hit = classify(key, value)
        if (!hit) continue
        out.push({
          type: 'dotenv',
          file,
          line,
          key,
          provider: hit.provider,
          confidence: hit.confidence,
          fingerprint: fingerprint(value),
          severity: hit.confidence === 'high' ? 'high' : 'medium',
          why: {
            es: `\`${key}\` es un secreto guardado en claro: cualquiera que lea este archivo lo tiene.`,
            en: `\`${key}\` is a secret stored in the clear: anyone who reads this file has it.`
          }
        })
      }
      return out
    }
  },

  {
    type: 'ssh-private-key',
    systems: ALL,
    match ({ file, text }) {
      if (text == null || !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) return []
      // Una llave con frase lo dice: PEM clásico con `Proc-Type: 4,ENCRYPTED`, PKCS#8 con
      // su propia cabecera, y el formato OpenSSH nuevo lo lleva dentro del base64.
      const encrypted = /Proc-Type:\s*4,ENCRYPTED/.test(text) ||
        /-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(text) ||
        isOpensshEncrypted(text)
      const type = encrypted ? 'ssh-private-key' : 'ssh-key-unencrypted'
      return [{
        type,
        file,
        fingerprint: fingerprint(text),
        severity: encrypted ? 'medium' : 'high',
        why: encrypted
          ? {
              es: 'Es una llave privada. Está protegida con una frase, pero vive en claro en el disco.',
              en: 'This is a private key. It has a passphrase, but it lives on disk in the clear.'
            }
          : {
              es: 'Es una llave privada **sin frase**: quien copie este archivo entra donde tú entras, sin más.',
              en: 'This is a private key **with no passphrase**: whoever copies this file gets in wherever you get in.'
            }
      }]
    }
  },

  {
    type: 'npm-token',
    systems: ALL,
    match ({ file, text }) {
      if (basename(file) !== '.npmrc' || text == null) return []
      const out = []
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const m = /_(?:auth|authToken|password)\s*=\s*(.+)$/.exec(lines[i])
        if (!m) continue
        const v = m[1].trim()
        if (!v || v.startsWith('${')) continue
        out.push({
          type: 'npm-token',
          file,
          line: i + 1,
          provider: 'npm',
          fingerprint: fingerprint(v),
          severity: 'high',
          why: {
            es: 'Es tu credencial de npm en claro: con ella se puede publicar en tu nombre.',
            en: 'This is your npm credential in the clear: it can publish packages as you.'
          }
        })
      }
      return out
    }
  },

  {
    type: 'gh-token',
    systems: ALL,
    match ({ file, text }) {
      if (text == null) return []
      const b = basename(file)
      if (b !== 'hosts.yml' && b !== 'hosts.yaml') return []
      const out = []
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const m = /oauth_token:\s*(\S+)/.exec(lines[i])
        if (!m) continue
        out.push({
          type: 'gh-token',
          file,
          line: i + 1,
          provider: 'GitHub',
          fingerprint: fingerprint(m[1]),
          severity: 'high',
          why: {
            es: 'Es tu sesión de GitHub en claro: da acceso a tus repos como si fueras tú.',
            en: 'This is your GitHub session in the clear: it reaches your repos as you.'
          }
        })
      }
      return out
    }
  },

  {
    type: 'cloud-credentials',
    systems: ALL,
    match ({ file, text }) {
      if (text == null) return []
      const b = basename(file)
      const looksCloud = b === 'credentials' || b === 'config.json' ||
        /^kubeconfig|\.kube[/\\]config$/.test(file) ||
        /application_default_credentials\.json$/.test(file)
      if (!looksCloud) return []
      const m = /(aws_secret_access_key|"private_key"|client_secret|"auth"|"password"|"token")\s*[:=]\s*"?([^"\n,]+)/i.exec(text)
      if (!m) return []
      return [{
        type: 'cloud-credentials',
        file,
        provider: providerOf(m[2]) || null,
        fingerprint: fingerprint(m[2]),
        severity: 'high',
        why: {
          es: 'Son credenciales de un servicio en la nube guardadas en claro: dan acceso a lo que tengas contratado ahí.',
          en: 'These are cloud service credentials stored in the clear: they reach whatever you run there.'
        }
      }]
    }
  },

  {
    type: 'keystore',
    systems: ALL,
    match ({ file, text }) {
      const b = basename(file)
      const ext = extname(b).toLowerCase()
      const isBinary = ['.jks', '.p12', '.pfx', '.keystore'].includes(ext)
      const isProps = b === 'keystore.properties' || b === 'google-services.json'
      if (!isBinary && !isProps) return []
      return [{
        type: 'keystore',
        file,
        fingerprint: fingerprint(file + (text ? text.length : '')),
        severity: isBinary ? 'high' : 'medium',
        why: {
          es: 'Es el certificado con el que firmas tus apps. Si se pierde, nadie puede publicar una actualización de tu app; si se filtra, otro puede firmar en tu nombre.',
          en: 'This is the certificate you sign your apps with. Lose it and nobody can ship an update; leak it and someone else can sign as you.'
        }
      }]
    }
  },

  {
    type: 'git-credentials',
    systems: ALL,
    match ({ file, text }) {
      const b = basename(file)
      if (!['.git-credentials', '.netrc', '_netrc', '.pgpass'].includes(b) || text == null) return []
      if (!text.trim()) return []
      return [{
        type: 'git-credentials',
        file,
        fingerprint: fingerprint(text),
        severity: 'high',
        why: {
          es: 'Este archivo guarda usuarios y contraseñas en claro para que no te las vuelvan a pedir.',
          en: 'This file keeps usernames and passwords in the clear so you are not asked again.'
        }
      }]
    }
  },

  {
    type: 'shell-history-secret',
    systems: ALL,
    match ({ file, text }) {
      const b = basename(file)
      const isHistory = ['.bash_history', '.zsh_history', 'ConsoleHost_history.txt'].includes(b)
      if (!isHistory || text == null) return []
      const out = []
      const lines = text.split(/\r?\n/)
      const seen = new Set()
      for (let i = 0; i < lines.length; i++) {
        for (const m of lines[i].matchAll(/(?:^|[\s='"])([A-Za-z0-9_\-.]{16,})(?=$|[\s'"])/g)) {
          const v = m[1]
          const provider = providerOf(v)
          if (!provider) continue
          const fp = fingerprint(v)
          if (seen.has(fp)) continue
          seen.add(fp)
          out.push({
            type: 'shell-history-secret',
            file,
            line: i + 1,
            provider,
            fingerprint: fp,
            severity: 'high',
            why: {
              es: `Escribiste una credencial de ${provider} en la terminal y quedó guardada en el historial.`,
              en: `You typed a ${provider} credential in the terminal and it stayed in the history file.`
            }
          })
        }
      }
      return out
    }
  }
]

function isOpensshEncrypted (text) {
  // En el formato OpenSSH nuevo, la cabecera dentro del base64 dice el cifrado usado;
  // "none" significa sin frase.
  const m = /-----BEGIN OPENSSH PRIVATE KEY-----\s*([\s\S]*?)-----END/.exec(text)
  if (!m) return false
  try {
    const buf = Buffer.from(m[1].replace(/\s+/g, ''), 'base64')
    const magic = 'openssh-key-v1\0'
    if (buf.subarray(0, magic.length).toString('binary') !== magic) return false
    const len = buf.readUInt32BE(magic.length)
    const cipher = buf.subarray(magic.length + 4, magic.length + 4 + len).toString('utf8')
    return cipher !== 'none'
  } catch { return false }
}

export const ruleTypes = rules.map(r => r.type)
  .concat(['ssh-key-unencrypted', 'world-readable', 'acl-too-open', 'tracked-by-git', 'ignored-but-present'])
