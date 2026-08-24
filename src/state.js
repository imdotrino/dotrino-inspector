// «Esto está bien así»: lo descartado por el usuario, persistente (DISENO §3).
// Un hallazgo descartado no vuelve a aparecer salvo que el archivo cambie — por eso se
// guarda la huella: si el secreto es otro, es un hallazgo nuevo y vuelve a salir.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const dir = () => join(process.env.DOTRINO_HOME || join(homedir(), '.dotrino'), 'inspector')
const file = () => join(dir(), 'dismissed.json')

export async function load () {
  try { return JSON.parse(await readFile(file(), 'utf8')) } catch { return { dismissed: {} } }
}

async function save (state) {
  await mkdir(dir(), { recursive: true })
  await writeFile(file(), JSON.stringify(state, null, 2))
}

export async function dismiss (id, reason = '') {
  const state = await load()
  state.dismissed[id] = { reason, at: new Date().toISOString() }
  await save(state)
  return state
}

export async function undismiss (id) {
  const state = await load()
  delete state.dismissed[id]
  await save(state)
  return state
}

export function applyDismissed (findings, state) {
  return findings.map(f => ({ ...f, dismissed: state.dismissed[f.id] || null }))
}
