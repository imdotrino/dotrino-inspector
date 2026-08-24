// Bilingüe es/en (CONVENCIONES §9). Lenguaje llano: se explica el beneficio, no la
// implementación (§9.1).
export const messages = {
  es: {
    scanning: 'Mirando…',
    scan: 'Revisar de nuevo',
    scanFirst: 'Revisar esta máquina',
    empty: 'Nada en claro por aquí.',
    emptyHint: 'Ningún archivo de los que se miraron tiene una credencial a la vista.',
    summary: ({ n, files }) => `${n} ${n === 1 ? 'hallazgo' : 'hallazgos'} · ${files} archivos mirados`,
    severity: { high: 'Grave', medium: 'Atención', low: 'Menor' },
    onlyReads: 'Solo lee. No edita, no borra y no arranca nada: la receta la aplicas tú.',
    scope: 'Dónde mirar',
    known: 'Las ubicaciones conocidas de esta máquina',
    addFolder: 'Añade la carpeta donde tienes tus proyectos',
    folderPlaceholder: '/ruta/a/tus/proyectos',
    add: 'Añadir',
    remove: 'Quitar',
    recipe: 'Qué hacer',
    copy: 'Copiar',
    copied: 'Copiado',
    copyAll: 'Copiar todos los pasos',
    dismiss: 'Esto está bien así',
    dismissed: 'Descartado',
    undismiss: 'Volver a mostrarlo',
    showDismissed: n => `Ver ${n} descartado${n === 1 ? '' : 's'}`,
    hideDismissed: 'Ocultar los descartados',
    noRecipe: 'Para esto todavía no hay receta. Sé encontrarlo, pero no sé decirte cómo recablearlo sin arriesgarme a romperte algo.',
    line: 'línea',
    times: n => `${n} veces en este archivo`,
    types: {
      dotenv: 'Secreto en un archivo .env',
      'ssh-private-key': 'Llave privada con frase',
      'ssh-key-unencrypted': 'Llave privada sin frase',
      'npm-token': 'Credencial de npm',
      'gh-token': 'Sesión de GitHub',
      'cloud-credentials': 'Credenciales de la nube',
      keystore: 'Certificado de firma',
      'git-credentials': 'Contraseñas guardadas para git',
      'shell-history-secret': 'Credencial en el historial de la terminal'
    }
  },
  en: {
    scanning: 'Looking…',
    scan: 'Check again',
    scanFirst: 'Check this machine',
    empty: 'Nothing in the clear here.',
    emptyHint: 'None of the files that were checked has a credential in plain sight.',
    summary: ({ n, files }) => `${n} ${n === 1 ? 'finding' : 'findings'} · ${files} files checked`,
    severity: { high: 'Serious', medium: 'Worth a look', low: 'Minor' },
    onlyReads: 'It only reads. It does not edit, delete or start anything: you apply the recipe.',
    scope: 'Where to look',
    known: 'The known locations on this machine',
    addFolder: 'Add the folder where you keep your projects',
    folderPlaceholder: '/path/to/your/projects',
    add: 'Add',
    remove: 'Remove',
    recipe: 'What to do',
    copy: 'Copy',
    copied: 'Copied',
    copyAll: 'Copy every step',
    dismiss: 'This is fine as it is',
    dismissed: 'Dismissed',
    undismiss: 'Show it again',
    showDismissed: n => `Show ${n} dismissed`,
    hideDismissed: 'Hide dismissed',
    noRecipe: 'No recipe for this one yet. I can find it, but I cannot tell you how to rewire it without risking breaking something.',
    line: 'line',
    times: n => `${n} times in this file`,
    types: {
      dotenv: 'Secret in a .env file',
      'ssh-private-key': 'Private key with a passphrase',
      'ssh-key-unencrypted': 'Private key with no passphrase',
      'npm-token': 'npm credential',
      'gh-token': 'GitHub session',
      'cloud-credentials': 'Cloud credentials',
      keystore: 'Signing certificate',
      'git-credentials': 'Passwords saved for git',
      'shell-history-secret': 'Credential in the terminal history'
    }
  }
}

export function detectLang () {
  try {
    const saved = localStorage.getItem('dotrino-lang')
    if (saved === 'es' || saved === 'en') return saved
  } catch {}
  return (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es'
}
