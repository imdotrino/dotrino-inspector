// @dotrino/update no publica tipos: aquí va lo que este repo usa de él.
declare module '@dotrino/update/notice' {
  /** Avisa por stderr, una vez al día, si hay versión nueva. Nunca lanza. */
  export function printUpdateNotice (opts: {
    current: string
    source: string
    repo?: string
    pkg?: string
    product?: string
    how?: string
  }): Promise<boolean>
}
