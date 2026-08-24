// Las recetas: qué hacer con cada hallazgo (DISENO §4.3).
//
// Son TEXTO PARA COPIAR, no un botón que aplica. Y llevan sus pasos en orden, incluido
// lo que el Inspector NO hace: comprobar que arranca y borrar el original son del usuario.
//
// Los comandos son los de verdad de `@dotrino/vault` y `@dotrino/env`; si alguno cambia
// allá, se corrige aquí, no se inventa una variante.
import { basename, dirname, sep } from 'node:path'

const q = s => (/[^\w@%+=:,./-]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s)

/** Nombre de cajón propuesto a partir de la ruta: el del proyecto, en minúsculas. */
export function suggestNamespace (file) {
  const dir = dirname(file)
  const parts = dir.split(sep).filter(Boolean)
  const name = parts[parts.length - 1] || 'app'
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'app'
}

/** Nombre de variable para una llave SSH: SSH_KEY_<ARCHIVO>. */
export function suggestKeyName (file) {
  const b = basename(file).replace(/\.(pem|key)$/i, '')
  return 'SSH_KEY_' + b.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
}

const b64 = (file, system) => system === 'win32'
  ? `[Convert]::ToBase64String([IO.File]::ReadAllBytes("${file}"))`
  : system === 'darwin' ? `base64 -i ${q(file)}` : `base64 -w0 ${q(file)}`

const enroll = ns => [
  { code: `dotrino-vault pair --service ${ns} --scope secrets:${ns}`, note: { es: 'en la máquina donde vive tu bóveda: te da una invitación', en: 'on the machine where your vault lives: it gives you an invitation' } },
  { code: `npx -y @dotrino/env enroll --ns ${ns} --code <invitación>`, note: { es: 'una sola vez por máquina', en: 'once per machine' } }
]

const CHECK = {
  es: 'Comprueba que arranca así. **Esto lo haces tú**: el Inspector no ejecuta nada.',
  en: 'Check that it starts this way. **This part is yours**: the Inspector runs nothing.'
}
const REMOVE = file => ({
  es: `Cuando arranque bien, borra \`${file}\`. Hasta entonces déjalo donde está.`,
  en: `Once it starts fine, delete \`${file}\`. Until then leave it where it is.`
})

/**
 * @returns {{title:{es,en}, steps:Array<{text?:{es,en}, code?:string, note?:{es,en}}>}|null}
 */
export function recipeFor (finding, system = 'linux') {
  const f = finding
  const file = f.file

  switch (f.type) {
    case 'dotenv': {
      const ns = suggestNamespace(file)
      return {
        title: {
          es: `Guarda este \`.env\` en tu bóveda y arranca con \`dotrino-env\``,
          en: `Store this \`.env\` in your vault and start with \`dotrino-env\``
        },
        steps: [
          ...enroll(ns),
          { code: `dotrino-vault secret import ${ns} ${q(file)}`, note: { es: 'sube las variables del archivo al cajón, de una vez', en: 'uploads every variable from the file into the drawer at once' } },
          { code: `npx -y @dotrino/env run --ns ${ns} -- <tu comando de arranque>`, note: { es: 'las variables solo existen en la memoria del proceso hijo', en: 'the variables only exist in the child process memory' } },
          { text: CHECK },
          { text: REMOVE(file) }
        ]
      }
    }

    case 'ssh-key-unencrypted': {
      const key = suggestKeyName(file)
      return {
        title: {
          es: 'Guarda la llave en tu bóveda y usa el agente: deja de estar en el disco',
          en: 'Store the key in your vault and use the agent: it stops living on disk'
        },
        steps: [
          ...enroll('ssh'),
          { code: system === 'win32'
              ? `dotrino-vault secret set ssh ${key} $(${b64(file, system)})`
              : `dotrino-vault secret set ssh ${key} "$(${b64(file, system)})"`,
            note: { es: 'la llave viaja en base64 y queda sellada en el cajón', en: 'the key travels as base64 and is sealed in the drawer' } },
          { code: 'npx -y @dotrino/env ssh-agent --ns ssh', note: { es: 'imprime la ruta del socket; la llave solo existe en memoria', en: 'prints the socket path; the key only exists in memory' } },
          { code: 'export SSH_AUTH_SOCK=<la ruta que imprimió>', note: { es: 'con esto `ssh` y `git` la usan sin que esté en el disco', en: 'with this `ssh` and `git` use it without it being on disk' } },
          { text: CHECK },
          { text: REMOVE(file) }
        ]
      }
    }

    case 'ssh-private-key':
      return {
        title: {
          es: 'Esta llave tiene frase: por ahora déjala como está',
          en: 'This key has a passphrase: leave it as it is for now'
        },
        steps: [
          { text: {
            es: 'El agente de la bóveda **solo admite llaves sin frase** — su cerradura es la propia bóveda, y una llave con frase ya tiene la suya. Está anotada aquí para que sepas que existe y dónde vive, no porque haya que hacer algo hoy.',
            en: 'The vault agent **only takes keys with no passphrase** — its lock is the vault itself, and a key with a passphrase already has one. It is listed here so you know it exists and where it lives, not because there is something to do today.'
          } }
        ]
      }

    case 'npm-token':
      return {
        title: {
          es: 'Saca el token de `.npmrc` y déjalo en la bóveda',
          en: 'Take the token out of `.npmrc` and leave it in the vault'
        },
        steps: [
          ...enroll('npm'),
          { code: 'dotrino-vault secret set npm NPM_TOKEN <tu token>', note: { es: 'si ya no lo tienes a mano, sácalo del propio `.npmrc` antes de borrarlo', en: 'if you no longer have it, take it from the `.npmrc` itself before deleting it' } },
          { code: '//registry.npmjs.org/:_authToken=${NPM_TOKEN}', note: { es: 'deja ESTO en el `.npmrc` (npm expande la variable del entorno)', en: 'leave THIS in the `.npmrc` (npm expands the env variable)' } },
          { code: 'npx -y @dotrino/env run --ns npm -- npm publish', note: { es: 'y publica así: el token solo existe mientras dura el comando', en: 'and publish like this: the token only exists while the command runs' } },
          { text: CHECK }
        ]
      }

    case 'gh-token':
      return {
        title: {
          es: 'Tu sesión de GitHub, en la bóveda en vez de en un archivo',
          en: 'Your GitHub session, in the vault instead of a file'
        },
        steps: [
          ...enroll('gh'),
          { code: 'dotrino-vault secret set gh GH_TOKEN <tu token>' },
          { code: 'npx -y @dotrino/env run --ns gh -- gh repo list', note: { es: '`gh` toma `GH_TOKEN` del entorno y no necesita el archivo', en: '`gh` picks `GH_TOKEN` from the environment and does not need the file' } },
          { text: CHECK },
          { code: 'gh auth logout', note: { es: 'cuando funcione: esto es lo que borra el archivo de sesión', en: 'once it works: this is what removes the session file' } }
        ]
      }

    case 'cloud-credentials': {
      const ns = suggestNamespace(file) === basename(dirname(file)).replace(/^\./, '') ? 'cloud' : 'cloud'
      return {
        title: {
          es: 'Las credenciales de la nube, al cajón; el comando las recibe al arrancar',
          en: 'Cloud credentials into the drawer; the command gets them at start'
        },
        steps: [
          ...enroll(ns),
          { code: `dotrino-vault secret set ${ns} CLAVE=valor CLAVE2=valor2`, note: { es: 'las que use tu proveedor (p. ej. `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)', en: 'whatever your provider uses (e.g. `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)' } },
          { code: `npx -y @dotrino/env run --ns ${ns} -- <tu comando>` },
          { text: CHECK },
          { text: REMOVE(file) }
        ]
      }
    }

    case 'keystore': {
      const key = 'KEYSTORE_' + basename(file).toUpperCase().replace(/[^A-Z0-9]+/g, '_')
      return {
        title: {
          es: 'El certificado de firma, sellado en la bóveda',
          en: 'Your signing certificate, sealed in the vault'
        },
        steps: [
          ...enroll('android'),
          { code: system === 'win32'
              ? `dotrino-vault secret set android ${key} $(${b64(file, system)})`
              : `dotrino-vault secret set android ${key} "$(${b64(file, system)})"`,
            note: { es: 'en base64; y guarda también su contraseña como otra variable', en: 'as base64; store its password as another variable too' } },
          { text: {
            es: 'En el build, escribe el archivo desde la variable a una ruta temporal y bórralo al terminar. **Guarda una copia fuera de esta máquina**: si pierdes este certificado, nadie puede volver a publicar una actualización de tu app.',
            en: 'In your build, write the file from the variable to a temp path and delete it afterwards. **Keep a copy off this machine**: lose this certificate and nobody can ship an update of your app again.'
          } },
          { text: CHECK }
        ]
      }
    }

    case 'git-credentials':
      return {
        title: {
          es: 'Deja de guardar contraseñas en un archivo de texto',
          en: 'Stop keeping passwords in a plain text file'
        },
        steps: [
          { text: {
            es: 'Este archivo existe para que no te vuelvan a pedir la contraseña. La alternativa que no la guarda en claro es **una llave SSH en el agente de la bóveda**: pásate a `git@…` en vez de `https://…` y usa el agente (mira la receta de una llave SSH en esta misma lista).',
            en: 'This file exists so you are not asked for the password again. The alternative that does not keep it in the clear is **an SSH key in the vault agent**: switch to `git@…` instead of `https://…` and use the agent (see an SSH key recipe in this same list).'
          } },
          { code: 'git remote set-url origin git@github.com:<usuario>/<repo>.git' },
          { text: CHECK },
          { text: REMOVE(file) }
        ]
      }

    case 'shell-history-secret': {
      // Puede ser la misma credencial escrita varias veces: se nombran todas las líneas,
      // porque borrar una sola deja el problema donde estaba.
      const lines = (f.occurrences || []).map(o => o.line).filter(Boolean)
      const where = lines.length > 1
        ? { es: ` (líneas ${lines.join(', ')})`, en: ` (lines ${lines.join(', ')})` }
        : f.line ? { es: ` (línea ${f.line})`, en: ` (line ${f.line})` } : { es: '', en: '' }
      return {
        title: {
          es: 'Esto ya no se puede proteger: se quita del historial y se rota',
          en: 'This one cannot be protected any more: remove it and rotate it'
        },
        steps: [
          { text: {
            es: `Escribiste la credencial en la terminal, así que quedó guardada tal cual${where.es}. Guardarla ahora en la bóveda **no la saca de aquí**: hay que borrar ${lines.length > 1 ? 'esas líneas' : 'esa línea'} y, como ya estuvo a la vista, **rotarla en ${f.provider || 'su proveedor'}** — eso se hace allá, el Inspector no lo hace por ti.`,
            en: `You typed the credential in the terminal, so it was written down as is${where.en}. Storing it in the vault now **does not take it out of here**: delete ${lines.length > 1 ? 'those lines' : 'that line'} and, since it was already exposed, **rotate it at ${f.provider || 'its provider'}** — that happens there, the Inspector does not do it for you.`
          } },
          { text: {
            es: 'Para que no vuelva a pasar: no pegues secretos en la línea de comandos. `dotrino-env run --ns <cajón> -- <comando>` se los pasa al proceso sin que pasen por el historial.',
            en: 'So it does not happen again: do not paste secrets on the command line. `dotrino-env run --ns <drawer> -- <command>` hands them to the process without going through the history.'
          } }
        ]
      }
    }

    default:
      return null
  }
}

/** Lo que se dice cuando el archivo está, además, seguido por git (DISENO §4.4). */
export function exposureNote (kind) {
  switch (kind) {
    case 'tracked-by-git':
      return {
        level: 'danger',
        es: 'Este archivo está **seguido por git**: el secreto ya viajó a donde hayas empujado el repo. Borrarlo ahora **no lo saca del historial** — la salida es rotar la credencial en su proveedor.',
        en: 'This file is **tracked by git**: the secret already travelled wherever you pushed. Deleting it now **does not remove it from history** — the way out is rotating the credential at its provider.'
      }
    case 'world-readable':
      return {
        level: 'warn',
        es: 'Los permisos dejan que otros usuarios de esta máquina lo lean.',
        en: 'Its permissions let other users of this machine read it.'
      }
    case 'ignored-but-present':
      return {
        level: 'info',
        es: 'Está en `.gitignore` — bien, no viajó — pero sigue en claro en el disco.',
        en: 'It is in `.gitignore` — good, it never travelled — but it is still on disk in the clear.'
      }
    default:
      return null
  }
}
