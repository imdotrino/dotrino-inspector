# Dotrino Inspector

Te enseña qué credenciales tienes guardadas en claro en tu máquina —contraseñas en un
`.env`, llaves SSH sin frase, tokens en el historial de la terminal— y te dice cómo
protegerlas con tu bóveda sin que se te caiga nada por el camino.

```sh
npx @dotrino/inspector            # abre la UI en tu escritorio
npx @dotrino/inspector --print    # el informe por la terminal
```

**Mira, explica y sugiere: decides tú.** Por ahora no ejecuta ninguna acción —no edita ni
borra archivos, no arranca servicios y no guarda nada por su cuenta— y no hay modo
automático. **Lo que encuentra no se lo cuenta a nadie**: no hay telemetría ni informes
remotos, hoy no abre una sola conexión, y el día que pueda guardar en tu bóveda solo
viajará el secreto que tú mandes, sellado para ella.

Documentación de uso: `wiki.dotrino.com` *(pendiente, F4)*. Diseño y decisiones:
[`docs/DISENO.md`](./docs/DISENO.md).

## Qué busca

`.env` con secretos · llaves privadas SSH (y cuáles no tienen frase) · tokens de npm y de
GitHub · credenciales de AWS/Google/Kubernetes/Docker · certificados de firma de apps ·
`.netrc`, `.pgpass`, `.git-credentials` · credenciales escritas en el historial del shell.

De cada hallazgo mira además **quién más puede leerlo** (permisos) y si **está seguido por
git** — que es el caso grave, porque entonces el secreto ya viajó.

Linux, macOS y Windows.

## Qué NO hace

- No edita, mueve ni borra archivos, y no arranca servicios para probar nada.
- **No rota credenciales.** Rotar es de cada proveedor; lo que aporta el Inspector es
  protegerlas con tu bóveda, que sirve igual para todas. Para lo ya filtrado en git avisa
  y te dice dónde se rota.
- No cuenta a nadie lo que encontró: ni telemetría, ni informes, ni rutas de tu disco.
  Hoy no abre ninguna conexión (la UI se sirve con `default-src 'self'`, así que no
  puede). Cuando sepa guardar en tu bóveda usará el proxio como transporte —igual que
  cualquier pieza del ecosistema— y lo que viaje irá sellado para tu bóveda.

## Desarrollo

```sh
npm test                 # el motor de detección y las invariantes del servidor local
npm run build            # compila la UI (web/) a web/dist
node bin/dotrino-inspector.js --no-open
```

La UI abre en **su propia ventana** (modo aplicación de Chromium, con perfil temporal que
se borra al cerrar); cerrarla apaga el servidor. `--browser` la abre en el navegador de
siempre y `--no-open` no abre nada e imprime la dirección.

El servidor local escucha **solo en `127.0.0.1`**, el token de la URL es de un solo uso
(se canjea por uno de sesión y se invalida) y **muere con el comando**.

## Licencia

MIT
