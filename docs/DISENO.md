# Dotrino Inspector — diseño

> Pedido por el dueño el 2026-08-24: *"una herramienta que busque archivos vulnerables y
> ayude a guardarlos en el vault, así como también que ayude a crear scripts para
> reemplazar la conectividad que se pierde"*, y **con UI para que el usuario vea las
> vulnerabilidades y decida**. Nombre elegido: **Dotrino Inspector**.
>
> Este documento manda sobre el código (§9.2 de las convenciones: los documentos de
> diseño se quedan en `docs/` de su repo). Lo que aquí no esté decidido, no se escribe.

## 1. Qué es

Una **herramienta de escritorio** —se levanta con `npx` y abre su UI— que recorre la máquina del usuario,
**enseña** qué credenciales tiene expuestas en archivos, y le ofrece —una por una, y
solo si él lo pide— guardarlas en su bóveda y **volver a dejar andando** lo que dependía
de ese archivo.

Las tres frases que definen el producto y de las que no se sale:

1. **Mira y reporta. No arregla solo.** Ninguna acción ocurre sin que el usuario la
   elija. El Inspector no tiene modo automático, ni siquiera opt-in.
2. **No rompe nada sin dar el recambio.** Nunca se ofrece "quitar este archivo" sin
   haber generado antes el arranque equivalente y **haberlo probado**. Un secreto en el
   `.env` está mal guardado, pero *está funcionando*; una herramienta que lo guarda bien
   y deja el servicio caído es peor que no hacer nada.
3. **No sale nada de la máquina.** El Inspector no tiene red hacia Dotrino. Ni telemetría,
   ni informes a la nube, ni "compárteme el hallazgo". El único destino de un secreto es
   la bóveda del propio usuario.

### Qué NO es

- **No es un antivirus ni un escáner de vulnerabilidades de dependencias.** No mira CVEs
  de npm, no mira paquetes del sistema, no mira procesos. Mira **archivos con secretos
  del usuario** y **cómo están guardados**. (La idea aparte de un escáner de
  vulnerabilidades del propio ecosistema es otra pieza; ver §11.)
- **No es una auditoría.** No se promete cumplimiento normativo ni certificación: el
  ecosistema no promete auditorías de terceros (`CLAUDE.md`, línea Enterprise).
- **No es para servidores.** Decidido por el dueño: es una **app de escritorio**, con
  ventana. En un VPS sin sesión gráfica no es su sitio — ahí manda el vault y su TUI. El
  comando detecta que no hay entorno gráfico y lo dice en vez de arrancar a medias.
- **No borra por su cuenta.** Borrar el original es siempre un paso separado, explícito,
  y posterior a la verificación.

### Su lugar en el ecosistema

El Inspector es **el "antes" de `dotrino-env`**. La cadena completa:

```
Inspector            → encuentra el secreto expuesto y te lo enseña
Inspector + vault    → lo guarda en el cajón que le corresponde
Inspector            → escribe el arranque equivalente y lo prueba
dotrino-env (vault)  → a partir de ahí, es quien se lo da al servicio al arrancar
```

No inventa almacén ni protocolo: **guardar es del vault** (`dotrino-vault`, cajones de
`dotrino-env`), **identidad y aprobación son del acta**. El Inspector es la cara que
faltaba: la que te enseña el problema y te acompaña a resolverlo.

## 2. Forma: se levanta con `npx`, la UI abre en el escritorio

Decidido por el dueño el 2026-08-24: **como todo lo demás del ecosistema, con un comando.**

```
npx @dotrino/inspector
```

El comando levanta un servidor **solo en `127.0.0.1`** y abre la UI en el escritorio del
usuario. No hay instalador que descargar, no hay binario que firmar, no hay toolchain
nuevo: es el mismo patrón de `npx dotrino-content` y `npx @dotrino/terminal-agent`, y a
quien no tenga Node lo bootstrapea el instalador universal (`dotrino.com/install.sh`,
`install.ps1`), que ya existe y es reutilizable por cualquier app.

Sigue siendo **una herramienta de escritorio, no de servidor**: asume una sesión gráfica
para abrir su ventana, y si no la hay lo dice en vez de arrancar a medias.

Lo que eso decide de una vez:

- **Nada de Tauri, nada de SEA, nada de `.deb`/`.exe`.** Un binario empaquetado no
  aportaría nada que `npx` no dé y sumaría dos toolchains (Rust para la ventana, SEA para
  el empaquetado) a un ecosistema que es JavaScript entero. El motivo de fondo: el
  Inspector **tiene que hablarle a la bóveda**, y el cliente del vault es JS — no se
  reimplementa en otro lenguaje (regla del ecosistema). Si un día existe ventana nativa,
  será una cáscara alrededor de esto, no un backend distinto.
- **La versión la lleva npm.** No aplica la §11.5 (versión en el nombre del archivo)
  porque no hay archivo descargable: `npx @dotrino/inspector@0.3.0` es el equivalente, y
  la UI enseña su versión.
- **Actualizar es no hacer nada:** `npx` ya trae la última. Un instalador tendría que
  resolver el problema del actualizador; así no existe.

> **Anotado, para después del Inspector** (acordado con el dueño el 2026-08-24): al dueño
> le gusta el patrón de los instaladores de agentes —**un comando una vez y después
> `dotrino-inspector` a secas**— y el instalador universal **hoy no hace eso**: `install.sh`
> asegura Node y hace `npx`, sin dejar comando en el `PATH`. Se arregla en
> `dotrino-install`, que lo hereda todo el ecosistema, y está descrito en
> [`PENDIENTES.md`](../../PENDIENTES.md). **No bloquea nada de aquí**: el Inspector se
> diseña y se escribe contra `npx`, y el día que el instalador sepa instalar de verdad,
> el Inspector se beneficia sin cambiar una línea.

El frontend es **Vite + Vue 3** como el resto (§1 de las convenciones), servido por el
propio comando, y comparte los componentes: `<dotrino-topbar>` con `profile` (§5, §6.1),
bilingüe es/en (§9), lenguaje llano (§9.1). Es una pantalla **administrativa** (§5.1):
empieza por la lista de hallazgos, no se presenta, no lleva documentación — lo que haya
que explicar va a su página del wiki o detrás de un botón `(i)`, **salvo las advertencias,
que se quedan a la vista**.

### El servidor local

Es la superficie de ataque de la herramienta, así que va acotado desde la primera línea:

- escucha **solo en `127.0.0.1`**, nunca en `0.0.0.0`;
- **token de un solo uso en la URL** que abre el propio comando: sin token no responde a
  nada, y se comprueba también el `Origin`;
- **muere con el comando**: cerrar la terminal apaga el servidor. No queda un demonio
  vivo con los secretos de la máquina a un puerto de distancia.

## 3. Qué busca (catálogo de hallazgos)

Cada hallazgo (`finding`) tiene un **tipo** (identificador en inglés, §8.1), un archivo,
una **razón** legible y una **acción propuesta**. El catálogo de F1:

| Tipo | Qué mira |
|---|---|
| `dotenv` | `.env`, `.env.*`, `*.env` con pares `CLAVE=valor` que parecen secretos |
| `ssh-private-key` | claves privadas en `~/.ssh` y sueltas por el disco (`BEGIN … PRIVATE KEY`) |
| `ssh-key-unencrypted` | de las anteriores, las que **no tienen frase**: se usan solas |
| `npm-token` | `_authToken` en `.npmrc` (el del repo y el de `~`) |
| `gh-token` | `~/.config/gh/hosts.yml`, `GH_TOKEN`/`GITHUB_TOKEN` en archivos |
| `cloud-credentials` | `~/.aws/credentials`, `~/.config/gcloud`, kubeconfig, `~/.docker/config.json` |
| `keystore` | `.jks`, `.p12`, `keystore.properties`, `google-services.json` |
| `git-credentials` | `~/.git-credentials`, `.netrc`, `.pgpass` |
| `shell-history-secret` | un valor que parece token en `~/.bash_history` / `.zsh_history` |
| `world-readable` | cualquiera de los anteriores con permisos que lo dejan leer a otros usuarios |
| `tracked-by-git` | cualquiera de los anteriores **dentro de un repo y seguido por git** (el más grave: ya viajó) |
| `ignored-but-present` | está en `.gitignore` — bien — pero sigue en claro en el disco |

Dos reglas del catálogo:

- **Se puede ampliar sin tocar la UI.** Un tipo es un módulo con `match()` y `explain()`;
  añadir uno no cambia la pantalla ni el flujo.
- **El valor del secreto no se guarda en ninguna parte.** El hallazgo lleva **ruta,
  tipo, nombre de la clave y una huella corta**; nunca el valor. Ni en memoria más allá
  de lo imprescindible, ni en el informe, ni en los logs. Esto es lo que permite que el
  informe se pueda enseñar a alguien.

### Ruido: el enemigo real

Un escáner que grita por todo se cierra a la semana. Tres defensas:

1. **Severidad por consecuencia, no por tipo.** Una llave SSH sin frase seguida por git
   es grave; un `.env` de un proyecto de juguete con `PORT=3000` no es nada.
2. **"Esto está bien así"**, por hallazgo y persistente, con su motivo. Un hallazgo
   descartado no vuelve a aparecer salvo que el archivo cambie.
3. **Nada de porcentajes ni notas globales.** No hay "tu seguridad es 73 %": es una nota
   inventada que no ayuda a decidir. Hay una lista, ordenada.

## 4. El flujo: ver → adoptar → recablear → verificar → retirar

Los cinco pasos son **del usuario**, uno a uno, y cada uno se puede parar.

### 4.1. Ver (`inspect`)

Recorrido del disco con las carpetas de siempre excluidas (`node_modules`, `.git/objects`,
`dist`, cachés). El usuario elige el alcance: su carpeta de proyectos, su `$HOME`, o una
ruta suelta. **Solo lectura.**

### 4.2. Adoptar (`adopt`) — guardarlo en el vault

El secreto pasa al cajón que le corresponde en la bóveda del usuario, por el camino que
ya existe (`ns` por servicio, valor sellado). Aquí:

- **La bóveda tiene que estar abierta**; si no lo está, la UI lo dice y enlaza, no falla
  con un error técnico.
- El Inspector **propone** el `ns` y el nombre de la clave (a partir de la ruta y del
  nombre de la variable) y el usuario los puede cambiar antes de aceptar.
- **Si el cajón ya tiene esa clave con otro valor, se para** y se enseña la diferencia.
  Pisar el secreto de un servicio en producción sin avisar es exactamente el fallo que
  esta herramienta existe para evitar.

### 4.3. Recablear (`wire`) — la conectividad que se pierde

Es la parte que el dueño pidió explícitamente y **la que decide si la herramienta se usa
o se abandona**. Al sacar el secreto del archivo, algo deja de arrancar; el Inspector
escribe el arranque equivalente:

| Hallazgo | Qué escribe |
|---|---|
| `.env` de un servicio Node | el arranque con `dotrino-env run --ns <ns> -- <comando>` |
| servicio de PM2 | el `ecosystem.config` equivalente, envuelto igual |
| unidad de systemd | el `ExecStart` envuelto y el `.env` fuera |
| llave SSH | `dotrino-env ssh-agent --ns ssh` (la llave solo en memoria) |
| token de npm / gh | el `.npmrc` / la sesión generados al vuelo y borrados al terminar |
| Docker / compose | el `env_file` sustituido por variables inyectadas al arrancar |

Reglas del recableado:

- **Se enseña el script antes de escribir nada**, con lo que cambia marcado. El usuario
  lo puede editar en la propia UI.
- **Nada se sobrescribe en silencio:** el archivo original se guarda al lado con su
  fecha, y la UI dice dónde quedó.
- **Si para un hallazgo no hay receta, se dice.** Es preferible "esto sé encontrarlo pero
  no sé recablearlo, aquí está lo que sí puedes hacer" a un script inventado.

### 4.4. Verificar (`verify`)

Arranca el servicio con el arranque nuevo y **sin** el archivo original (movido a un lado,
no borrado) y dice si levantó. **Es el paso que da permiso al siguiente**: sin verificación
verde, la UI no ofrece retirar el original.

### 4.5. Retirar (`retire`)

Recién aquí se ofrece borrar el archivo en claro. Y con lo que corresponda según el caso:
si estaba `tracked-by-git`, **se advierte de que el secreto ya está en el historial y que
borrarlo ahora no lo saca de ahí** — la salida real es rotar la credencial, y eso se dice,
aunque no lo haga la herramienta.

## 5. Seguridad de la propia herramienta

Una herramienta que reúne en una pantalla todos los secretos de la máquina es un objetivo
goloso. Las invariantes, y **cada una se escribe como test** (memoria del ecosistema: lo
que no es un test, no es una invariante):

1. **Sin red saliente.** El Inspector no habla con ningún dominio de Dotrino. La bóveda es
   local o del acta; nada más.
2. **El servidor local escucha solo en `127.0.0.1`**, con token de un solo uso, y se
   apaga al cerrar la ventana.
3. **El valor de un secreto nunca se escribe en disco por el Inspector**, salvo el destino
   pedido: el cajón de la bóveda.
4. **Los logs no llevan valores**, y van en inglés (§8.1).
5. **El informe exportable no contiene secretos** — rutas, tipos y huellas. Está pensado
   justo para poder enseñarlo.
6. **Sin modo automático.** No hay bandera que adopte y borre sin preguntar. Si alguien la
   pide, la respuesta es no: esa bandera es la que un día se lleva por delante una
   producción.

## 6. Identidad, aprobación y multi-aparato

La app lleva identidad como todas (§6.1) y el aparato se enrola con `@dotrino/remote-agent`
—**no se escribe otro enrolamiento** (memoria del ecosistema)—. Con eso:

- Adoptar un secreto es una **escritura en la bóveda**, así que pasa por lo que ya hay:
  permisos por aparato y, si el aparato está marcado, **aprobación desde el teléfono**
  (vault 0.50).
- Revisar **otra** máquina desde esta (el VPS desde el escritorio) queda **fuera de F1** y
  anotado como F5. Es tentador y es la mitad de un producto distinto.

## 7. Fases

| Fase | Qué entra |
|---|---|
| **F0** | Este documento aprobado. Repo, `develop` + `main` protegida (§11.6). |
| **F1** | `npx @dotrino/inspector` levantando la UI + motor de detección (catálogo §3) + **ver** y **descartar**. Sin escribir nada. Ya es útil solo. |
| **F2** | **Adoptar** en el vault, con la comprobación de colisión. |
| **F3** | **Recablear** + **verificar** + **retirar**, con las recetas de §4.3. |
| **F4** | Landing en `inspector.dotrino.com` (§1.2) con el `npx` y el instalador universal, página en el wiki (§9.2), alta en el catálogo (§11.4). |
| **F5** | Revisar otra máquina del acta. |

F1 se puede publicar solo: **enseñar el problema ya vale**, aunque el usuario todavía
tenga que resolverlo a mano.

## 8. Decisiones tomadas aquí

- Nombre **Dotrino Inspector**; repo `dotrino-inspector`, npm `@dotrino/inspector`,
  subdominio `inspector.dotrino.com` (landing, §1.2).
- Nombres alternativos descartados: `guard`, `sentinel`, `defender`, `watchtower` — todos
  presuponen un antagonista, contra la regla de redacción de `CLAUDE.md`. `audit` promete
  una auditoría que no existe.
- **Se levanta con `npx`** (§2). Sin binario empaquetado, sin instalador, sin Tauri ni SEA: la versión la lleva npm y actualizar es no hacer nada.
- **Sin modo automático**, nunca (§5.6).
- **Retirar el original exige verificación verde** (§4.4).

## 9. Lo que falta decidir

1. **Alcance por defecto del recorrido.** ¿`$HOME` entero la primera vez (lento, y mira
   carpetas que el usuario quizá no espera) o solo la carpeta de proyectos y el `~/.ssh`?
2. **Qué pasa con `tracked-by-git`.** ¿El Inspector se mete a ayudar a rotar la credencial
   (abrir la página del proveedor, guardar la nueva), o solo advierte? Ayudar es mucho más
   útil y mucho más trabajo.
3. **Windows y macOS.** El `npx` corre en los tres, pero F1 asume Linux en el catálogo: los
   tipos cambian bastante (Credential Manager, Llavero). ¿Entran en F4 o se dejan fuera de
   la primera versión?
4. **El escáner del ecosistema.** Ver §11.

## 10. Lo que reusa (y no se reimplementa)

`@dotrino/vault` (cajones y `dotrino-env`) · `@dotrino/identity` (identidad y firma) ·
`@dotrino/remote-agent` (enrolar el aparato) · `@dotrino/topbar`, `@dotrino/support`,
`@dotrino/profile` (UI) · el instalador universal `dotrino.com/install.sh` para quien no
tenga Node.

## 11. Relación con la idea del "escáner de vulnerabilidades"

Hay anotada aparte una idea del dueño: **una herramienta que busque vulnerabilidades en el
propio ecosistema Dotrino**. No es esto. Aquella mira **el código de Dotrino**; el Inspector
mira **la máquina del usuario**. Se parecen en la palabra y en nada más, y **conviene que no
se fusionen**: un producto que hace las dos cosas no se le explica a nadie.

Si algún día comparten algo, será el motor de reglas, no la pantalla.
