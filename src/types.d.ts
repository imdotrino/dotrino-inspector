// Los tipos del Inspector. Solo tipos: no hay nada en marcha aquí.

export type System = 'linux' | 'darwin' | 'win32'
export type Severity = 'high' | 'medium' | 'low'
export interface Text { es: string, en: string }
export type Exposure = 'world-readable' | 'tracked-by-git' | 'ignored-but-present'

/** Lo que devuelve una regla. El VALOR del secreto no viaja nunca (DISENO §5.3). */
export interface RawFinding {
  type: string
  file: string
  line?: number
  key?: string
  provider?: string | null
  confidence?: 'high' | 'low'
  fingerprint: string
  severity: Severity
  why: Text
}

/** Un hallazgo con lo que rodea al archivo (permisos, git) y su id. */
export interface Finding extends RawFinding {
  id: string
  exposure: Exposure[]
  mode?: string
  repo?: string | null
}

export interface Occurrence { line: number | null, key: string | null, provider: string | null, fingerprint: string }

/** Varios hallazgos del mismo tipo en el mismo archivo, como una sola tarjeta. */
export interface GroupedFinding extends Finding {
  count: number
  occurrences: Occurrence[]
}

export interface Dismissal { reason: string, at: string }
export interface DismissState { dismissed: Record<string, Dismissal> }
export type WithDismissed<F> = F & { dismissed: Dismissal | null }

export interface RuleContext { file: string, text: string | null, system: System }
export interface Rule { type: string, systems: System[], match (ctx: RuleContext): RawFinding[] }

export interface RecipeStep { text?: Text, code?: string, note?: Text }
export interface Recipe { title: Text, steps: RecipeStep[] }
export interface ExposureNote extends Text { level: 'danger' | 'warn' | 'info' }

export interface Location { path: string, depth: number, systems?: System[] }
