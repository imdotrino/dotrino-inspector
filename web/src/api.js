// El token de la URL se canjea UNA vez por uno de sesión y se borra de la barra de
// direcciones. Recargar la página sigue funcionando porque el de sesión vive en
// sessionStorage (y muere al cerrar la pestaña, como el servidor).
const KEY = 'dotrino-inspector-session'

let token = null
try { token = sessionStorage.getItem(KEY) } catch {}

export async function connect () {
  const url = new URL(location.href)
  const t = url.searchParams.get('t')
  if (t) {
    url.searchParams.delete('t')
    history.replaceState(null, '', url.pathname + url.search + url.hash)
    const r = await fetch('/api/session', { method: 'POST', body: JSON.stringify({ t }) })
    if (r.ok) {
      token = (await r.json()).token
      try { sessionStorage.setItem(KEY, token) } catch {}
    }
  }
  if (!token) throw new Error('no session')
  return api('/api/context')
}

export async function api (path, body) {
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText)
  return r.json()
}

/** El recorrido llega por trozos: progreso mientras pasa y el resultado al final. */
export function scan ({ roots = [], known = true }, { onProgress, onDone, onError }) {
  const params = new URLSearchParams({ roots: roots.join('\n'), known: known ? '1' : '0' })
  const ctrl = new AbortController()
  fetch('/api/scan?' + params, {
    headers: { authorization: 'Bearer ' + token },
    signal: ctrl.signal
  }).then(async r => {
    if (!r.ok) throw new Error('scan failed')
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2)
        const ev = /^event: (\S+)/m.exec(chunk)?.[1]
        const data = /^data: (.*)$/m.exec(chunk)?.[1]
        if (!ev || !data) continue
        const payload = JSON.parse(data)
        if (ev === 'progress') onProgress?.(payload)
        else if (ev === 'done') onDone?.(payload)
        else if (ev === 'failed') onError?.(new Error(payload.error))
      }
    }
  }).catch(err => { if (err.name !== 'AbortError') onError?.(err) })
  return () => ctrl.abort()
}
