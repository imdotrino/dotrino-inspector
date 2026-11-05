// Lo que la UI recibe del servidor (src/server.js). Solo tipos.
import type { GroupedFinding, Recipe, ExposureNote, Dismissal, System } from '../../src/types.js'

/** Una tarjeta tal cual la manda `/api/scan`. */
export type UiFinding = GroupedFinding & {
  dismissed: Dismissal | { at: string } | null
  recipe: Recipe | null
  notes: ExposureNote[]
}

export interface ScanDone { system: System, scanned: number, findings: UiFinding[] }
export interface ScanProgress { file: string }

export type Messages = typeof import('./i18n.js').messages.es
