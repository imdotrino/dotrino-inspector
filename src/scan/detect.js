// Heurísticas para decidir si un valor es un secreto de verdad. Aquí se gana o se pierde
// la herramienta: un escáner que grita por todo se cierra a la semana (DISENO §3).
import { createHash } from 'node:crypto'

// El valor NUNCA se guarda ni se enseña. Lo único que sale del scanner es esta huella,
// que sirve para distinguir dos hallazgos y para nada más (DISENO §3, §5).
export function fingerprint (value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 8)
}

// Prefijos que un proveedor emite y no se confunden con otra cosa: si aparece esto,
// es un secreto, sin más análisis.
const KNOWN_PREFIXES = [
  ['ghp_', 'GitHub'], ['gho_', 'GitHub'], ['ghs_', 'GitHub'], ['ghu_', 'GitHub'],
  ['github_pat_', 'GitHub'],
  ['npm_', 'npm'],
  ['sk-', 'OpenAI'], ['sk-ant-', 'Anthropic'],
  ['xoxb-', 'Slack'], ['xoxp-', 'Slack'], ['xapp-', 'Slack'],
  ['AKIA', 'AWS'], ['ASIA', 'AWS'],
  ['AIza', 'Google'],
  ['SG.', 'SendGrid'],
  ['re_', 'Resend'],
  ['sk_live_', 'Stripe'], ['pk_live_', 'Stripe'], ['rk_live_', 'Stripe'],
  ['glpat-', 'GitLab'],
  ['dop_v1_', 'DigitalOcean'],
  ['shpat_', 'Shopify'],
  ['hf_', 'Hugging Face']
]

/** Devuelve el nombre del proveedor si el valor lleva un prefijo conocido. */
export function providerOf (value) {
  const v = String(value)
  for (const [prefix, name] of KNOWN_PREFIXES) if (v.startsWith(prefix)) return name
  return null
}

// Nombres de variable que anuncian un secreto.
const SECRET_NAME = /(?:^|_|-)(?:secret|token|password|passwd|pwd|apikey|api_key|privatekey|private_key|credential|auth|access_key|client_secret|session|cookie|salt|signing|webhook)(?:$|_|-)/i

// …y los que parecen secreto pero no lo son. Sin esto, medio `.env` es un falso positivo.
const NOT_SECRET_NAME = /(?:^|_|-)(?:public|pub|url|uri|endpoint|host|port|user|username|email|name|id|env|mode|debug|level|version|timeout|region|bucket|path|dir|file|locale|lang|enabled?|disabled?)(?:$|_|-)/i

// Valores que son claramente un hueco por rellenar, no una credencial.
const PLACEHOLDER = /^(?:|-|x{3,}|\.{3,}|changeme|change_me|your[-_ ]?\w*|<[^>]*>|\$\{[^}]*\}|todo|tbd|none|null|nil|undefined|true|false|test|example|sample|dummy|placeholder|secret|password|123+|abc+)$/i

/** Entropía de Shannon por carácter. Un token real ronda 3.5–5; una palabra, 2–3. */
export function entropy (value) {
  const s = String(value)
  if (!s.length) return 0
  const freq = new Map()
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1)
  let h = 0
  for (const n of freq.values()) {
    const p = n / s.length
    h -= p * Math.log2(p)
  }
  return h
}

/**
 * ¿Este par clave/valor es un secreto?
 * Devuelve null si no lo es, o { confidence, provider, reason } si lo es.
 */
export function classify (key, value) {
  const k = String(key || '')
  const v = String(value == null ? '' : value).trim().replace(/^["']|["']$/g, '')

  if (!v || PLACEHOLDER.test(v)) return null
  // Rutas, URLs sin credencial embebida y números no son secretos.
  if (/^(?:\/|\.{1,2}\/|[A-Za-z]:\\)/.test(v)) return null
  if (/^\d+(?:\.\d+)*$/.test(v)) return null

  const provider = providerOf(v)
  if (provider) return { confidence: 'high', provider, reason: 'known-prefix' }

  // Una URL con contraseña dentro (postgres://user:pass@host) sí lo es.
  const urlCred = /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:([^/\s@]+)@/i.exec(v)
  if (urlCred && !PLACEHOLDER.test(urlCred[1])) {
    return { confidence: 'high', provider: null, reason: 'url-credentials' }
  }

  if (/^https?:\/\//i.test(v)) return null

  const named = SECRET_NAME.test(k) && !NOT_SECRET_NAME.test(k)
  const h = entropy(v)

  if (named && v.length >= 8) return { confidence: 'high', provider: null, reason: 'secret-name' }
  if (named) return { confidence: 'low', provider: null, reason: 'secret-name-short' }
  // Sin nombre delator hace falta que el valor mismo parezca aleatorio.
  if (v.length >= 24 && h >= 3.8 && /[A-Za-z]/.test(v) && /\d/.test(v)) {
    return { confidence: 'low', provider: null, reason: 'high-entropy' }
  }
  return null
}

/** Pares CLAVE=valor de un archivo tipo .env, con su número de línea. */
export function parseEnv (text) {
  const out = []
  const lines = String(text).split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line || /^\s*[#;]/.test(line)) continue
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*[=:]\s*(.*)$/.exec(line)
    if (!m) continue
    let value = m[2]
    // Valor entre comillas: se toma hasta la comilla de cierre (puede llevar # dentro).
    const quoted = /^(["'])((?:\\.|(?!\1).)*)\1/.exec(value)
    if (quoted) value = quoted[2]
    else {
      const hash = value.indexOf(' #')
      if (hash > 0) value = value.slice(0, hash)
    }
    out.push({ key: m[1], value: value.trim(), line: i + 1 })
  }
  return out
}
