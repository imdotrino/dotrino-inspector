// Severidad por CONSECUENCIA, no por tipo (DISENO §3): lo que agrava un hallazgo es
// dónde está y quién puede leerlo, no cómo se llama.
const RANK = { high: 3, medium: 2, low: 1 }

export function finalSeverity (f) {
  let rank = RANK[f.severity] || 1
  if (f.exposure?.includes('tracked-by-git')) rank = 3      // ya viajó: no hay nada peor
  else if (f.exposure?.includes('world-readable')) rank = Math.min(3, rank + 1)
  if (f.confidence === 'low' && !f.exposure?.length) rank = Math.max(1, rank - 1)
  return rank === 3 ? 'high' : rank === 2 ? 'medium' : 'low'
}

export function sortFindings (findings) {
  const order = { high: 0, medium: 1, low: 2 }
  return [...findings].sort((a, b) =>
    (a.dismissed ? 1 : 0) - (b.dismissed ? 1 : 0) ||
    order[a.severity] - order[b.severity] ||
    a.file.localeCompare(b.file) ||
    (a.line || 0) - (b.line || 0))
}

/**
 * Agrupa por (tipo, archivo): seis tarjetas idénticas del mismo `.bash_history` —o veinte
 * de un `.env` con veinte claves— son la misma decisión repetida, y leerlas una a una es
 * lo que hace que la herramienta canse (DISENO §3, «ruido: el enemigo real»).
 *
 * El id del grupo lleva las huellas dentro: si el archivo cambia, es un hallazgo nuevo y
 * vuelve a salir aunque el anterior estuviera descartado.
 */
export function groupFindings (findings) {
  const groups = new Map()
  for (const f of findings) {
    const key = `${f.type}:${f.file}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(f)
  }
  const order = { high: 3, medium: 2, low: 1 }
  const out = []
  for (const [key, list] of groups) {
    const worst = list.reduce((a, b) => (order[b.severity] > order[a.severity] ? b : a))
    const fps = list.map(f => f.fingerprint).sort().join(',')
    out.push({
      ...worst,
      id: `${key}:${hash(fps)}`,
      count: list.length,
      occurrences: list.map(f => ({
        line: f.line || null,
        key: f.key || null,
        provider: f.provider || null,
        fingerprint: f.fingerprint
      }))
    })
  }
  return out
}

// Huella corta y estable de un conjunto de huellas. No es criptografía: solo tiene que
// cambiar cuando cambia el contenido.
function hash (s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(36)
}
