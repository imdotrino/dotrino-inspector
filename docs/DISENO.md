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
2. **No toca nada. Sugiere.** Por ahora no edita, no mueve, no borra archivos y no
   arranca servicios: encuentra, explica y te da la receta del recambio. Un secreto en el
   `.env` está mal guardado, pero *está funcionando* — y una herramienta que lo guarda
   bien y te deja el servicio caído es peor que no hacer nada.
3. **Lo que encuentra no sale de la máquina.** Ni telemetría, ni informes a la nube, ni
   "compárteme el hallazgo": ningún servidor se entera nunca de qué se halló ni de dónde.
   Lo único que puede salir es **un secreto que el usuario mande a su propia bóveda**, y
   sale sellado para ella. Ojo con la formulación: **no** es "el Inspector no se conecta a
   Dotrino" — hablarle a tu bóveda usa el proxy como transporte. El detalle, en §5.1.

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
- **No es un arreglador automático.** No edita archivos ni borra el original: eso lo
  haces tú siguiendo la receta que te da (§4).

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

**Y abre en SU PROPIA VENTANA, no en una pestaña** (pedido del dueño el 2026-08-25). Una
herramienta que enseña las credenciales que tienes en claro no es una pestaña más entre
veinte: tiene que verse y cerrarse como una aplicación. Se consigue con el **modo
aplicación de Chromium** (`--app=`), que ya está instalado en la máquina del usuario:
ventana sin barra de direcciones ni pestañas, con **perfil temporal propio** (sin
extensiones ni sesiones heredadas, y se borra al cerrar) y, en Linux, su propio
`--class` para que el conmutador de tareas la nombre Inspector y no Chrome.

Tres consecuencias, y las tres son a favor:

- **No se descarga nada.** Un webview nativo o Electron no encajan aquí: esto corre con
  `npx`, y las convenciones §1.1 obligan a `ignore-scripts=true`, así que un módulo con
  binario por `postinstall` **no llegaría a instalarse** en la máquina del usuario. Esto
  no contradice el «nada de Tauri» de arriba: no añade toolchain ninguno.
- **La ventana ES la aplicación**: al cerrarla se apaga el servidor local. Antes había
  que acordarse del Ctrl+C, y hasta entonces quedaba un puerto con los hallazgos detrás.
- **Si no hay ningún Chromium**, cae al navegador de siempre exactamente como antes; y
  `--browser` fuerza ese camino a propósito.

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
propio comando, con `<dotrino-topbar>` (§5), bilingüe es/en (§9) y lenguaje llano (§9.1).

> **Excepción al §6.1 (botón de perfil), acotada a F1.** Va **sin** `profile` por una
> razón simple: en F1 el Inspector **no tiene identidad todavía** — no guarda nada, no
> firma nada, no hay a quién enseñar. Pintar el perfil obligaría a cargar el iframe del
> vault para no mostrar nada útil. Por lo mismo lleva `support-no-count`: la moneda
> registraba su apertura en el store compartido y el topbar no sabía callarlo, así que se
> le añadió el atributo a `@dotrino/topbar` (0.8.3) en vez de rodearlo desde aquí.
>
> **En F2 esto se revisa**: al enrolarse como aparato para escribir en la bóveda, el
> Inspector sí tendrá identidad, y entonces el §6.1 aplica como a cualquier app. Es una pantalla **administrativa** (§5.1):
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

### Los tres entornos, desde F1

Decidido por el dueño el 2026-08-24: **Linux, macOS y Windows desde la primera versión.**
El `npx` corre en los tres, así que la diferencia está en el catálogo. Cada tipo declara
en qué sistemas aplica y **dónde mira en cada uno**:

| | Linux | macOS | Windows |
|---|---|---|---|
| llaves SSH | `~/.ssh` | `~/.ssh` | `%USERPROFILE%\.ssh` |
| historial del shell | `.bash_history`, `.zsh_history` | `.zsh_history` | `ConsoleHost_history.txt` de PowerShell |
| nube | `~/.aws`, `~/.config/gcloud`, kubeconfig | igual | `%USERPROFILE%\.aws`, `%APPDATA%` |
| permisos | `world-readable` por modo Unix | igual | ACL: **otro concepto**, ver abajo |

Dos consecuencias que hay que respetar y son fáciles de equivocar:

- **El llavero del sistema NO es un hallazgo.** El Llavero de macOS y el Administrador de
  credenciales de Windows guardan cifrado y con permiso del sistema: ahí el secreto está
  **bien**. El Inspector mira **archivos en claro**, y marcar el llavero sería ruido del
  peor tipo — el que enseña a ignorar la herramienta.
- **`world-readable` no se traduce a Windows.** El modo Unix no existe ahí; el equivalente
  es mirar la ACL, y es lo bastante distinto como para que sea **su propio tipo**
  (`acl-too-open`) en vez de forzar el de Unix a decir algo que no significa.

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

## 4. El flujo: ver y sugerir (las acciones, después)

Decidido por el dueño el 2026-08-24: **por lo pronto el Inspector sugiere cómo, pero no
edita nada.** No escribe, no mueve, no borra ni un archivo de la máquina, y no arranca
servicios. Encuentra, explica y te da la receta; aplicarla es tuyo.

Esto no es una versión recortada por falta de tiempo: es lo que hace que la herramienta se
pueda abrir sin miedo la primera vez. Un programa que recorre tu disco buscando secretos y
además **modifica** archivos de arranque es algo que nadie corre a ciegas. Uno que solo
mira y te dice qué hacer, sí.

**Y las acciones son un paso posterior** (confirmado el mismo día): en la primera versión
el Inspector **no ejecuta nada**, tampoco escribir en la bóveda. Guardar, recablear y
retirar existen en este documento porque hay que diseñarlos ahora —la receta que se sugiere
tiene que ser exactamente la que un día se aplique sola—, pero se implementan después
(§7).

### 4.1. Ver (`inspect`)

Recorrido del disco con las carpetas de siempre excluidas (`node_modules`, `.git/objects`,
`dist`, cachés). El usuario elige el alcance (§9.1). **Solo lectura**, y esto es literal:
el Inspector abre archivos para mirarlos y nada más.

### 4.2. Guardar en la bóveda (`adopt`) — *fase posterior*

**No entra en la primera versión**; se diseña aquí porque la receta que el Inspector
sugiere tiene que nombrar el cajón y la clave exactos, y para eso hay que tener decidido
cómo se llaman. Mientras tanto, la receta le dice al usuario cómo guardarlo él con
`dotrino-env`.

El secreto pasa al cajón que le corresponde en la bóveda del usuario, por el camino que ya
existe (`ns` por servicio, valor sellado). **El archivo original se queda intacto donde
está** — esto añade una copia protegida, no mueve nada.

- **La bóveda tiene que estar abierta**; si no lo está, la UI lo dice y enlaza, no falla
  con un error técnico.
- El Inspector **propone** el `ns` y el nombre de la clave (a partir de la ruta y del
  nombre de la variable) y el usuario los puede cambiar antes de aceptar.
- **Si el cajón ya tiene esa clave con otro valor, se para** y se enseña la diferencia.
  Pisar el secreto de un servicio en producción sin avisar es exactamente el fallo que
  esta herramienta existe para evitar.

### 4.3. Sugerir cómo (`suggest`) — la conectividad que se pierde

Es la parte que el dueño pidió explícitamente y **la que decide si la herramienta se usa o
se abandona**. Si sacas el secreto del archivo, algo deja de arrancar; el Inspector te
enseña —**en pantalla, para copiar**— el arranque equivalente:

| Hallazgo | Qué te enseña |
|---|---|
| `.env` de un servicio Node | el arranque con `dotrino-env run --ns <ns> -- <comando>` |
| servicio de PM2 | el `ecosystem.config` equivalente, envuelto igual |
| unidad de systemd | el `ExecStart` envuelto y el `.env` fuera |
| llave SSH | `dotrino-env ssh-agent --ns ssh` (la llave solo en memoria) |
| token de npm / gh | el `.npmrc` / la sesión generados al vuelo y borrados al terminar |
| Docker / compose | el `env_file` sustituido por variables inyectadas al arrancar |

Reglas de la sugerencia:

- **Es texto que copias, no un botón que aplica.** La UI lo enseña completo, con el `ns` y
  las claves reales ya rellenados —nada de `<PON_AQUÍ_TU_NS>`— y un botón de copiar.
- **Lleva sus pasos en orden**, incluido lo que el Inspector no hace: *"comprueba que
  arranca así; cuando arranque, borra el `.env`"*. La comprobación y el borrado son tuyos,
  y la receta lo dice en vez de darlo por sabido.
- **Si para un hallazgo no hay receta, se dice.** Es preferible "esto sé encontrarlo pero
  no sé cómo recablearlo, esto es lo que sí puedes hacer" a un script inventado que rompe
  un despliegue.

### 4.4. Lo que el Inspector NO hace (y por qué está escrito aquí)

En la primera versión, **ninguna acción**: ni guardar en la bóveda (§4.2). Y estas tres,
además, no las hace ni con las acciones ya implementadas, salvo decisión explícita del
dueño:

- **no edita, mueve ni borra archivos** — el `.env` lo borras tú, cuando compruebes que ya
  no hace falta;
- **no arranca servicios** para verificar. Por eso desaparece el problema de *"¿y si el
  proyecto no sabe arrancar solo?"*: no hay nada que arrancar, la comprobación es del
  usuario y la receta le dice cómo hacerla;
- **no rota credenciales.** Del dueño, el mismo día: *"la idea es que te ayude a proteger
  con Dotrino Vault antes que rotar"*. Rotar es del proveedor —GitHub, AWS, npm, cada uno
  con su pantalla y su API—, y prometerlo es prometer un catálogo de integraciones que
  envejece solo. Guardar en la bóveda, en cambio, sirve igual para cualquier credencial.
  Y el orden importa: **rotar sin proteger no arregla nada**, la credencial nueva acaba en
  el mismo `.env` en claro que la vieja.

Para el caso peor —`tracked-by-git`, el secreto ya viajó— la advertencia se queda a la
vista (§5.1 de las convenciones: las advertencias no se esconden) y es explícita: **borrarlo
ahora no lo saca del historial**, y ahí sí la salida es rotar en el proveedor. El Inspector
lo **dice** —con el nombre del proveedor si lo sabe y el enlace a donde se hace— pero no lo
hace por ti, y no finge que borrar bastó.

Cuando alguna de estas cosas se implemente, será **opt-in, por hallazgo y con la receta a
la vista antes de tocar nada** — nunca un modo automático (§5).

## 5. Seguridad de la propia herramienta

Una herramienta que reúne en una pantalla todos los secretos de la máquina es un objetivo
goloso. Las invariantes, y **cada una se escribe como test** (memoria del ecosistema: lo
que no es un test, no es una invariante):

1. **Lo hallado no viaja.** Ningún hallazgo —ni una ruta, ni un tipo, ni un recuento—
   sale de la máquina. No hay telemetría ni informes remotos, y no los habrá. Lo único
   que sale, y solo si el usuario lo pide hallazgo a hallazgo, es el secreto que él
   manda a su bóveda (§5.1).
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

### 5.1. Entonces, ¿el Inspector se conecta a Dotrino o no?

Hay que decirlo con precisión, porque la versión corta —«no sale nada de tu máquina»— se
rompe en cuanto aparece la primera acción, y una promesa que se rompe sola es peor que no
haberla hecho.

**Hoy (F1): cero red.** El Inspector solo lee tu disco y te enseña lo que hay. No abre una
sola conexión, y la propia UI lo hace imposible: la página se sirve con
`default-src 'self'`, así que **no puede** pedirle nada a nadie que no sea su servidor
local — ni aunque alguien metiera el código para hacerlo.

**Desde F2, cuando pueda guardar en la bóveda: sí, una conexión, y es inevitable.** El
plano de control de la bóveda va por `wss://proxy.dotrino.com` (`@dotrino/vault`,
`lib/src/index.js`) — **también cuando la bóveda está en esta misma máquina**: no existe
un socket local para eso. O sea que guardar un secreto en tu propia bóveda pasa por el
proxio. Lo que hay que entender de esa conexión:

- **El proxio no puede leer lo que transporta.** Los secretos viajan **sellados para la
  bóveda destinataria**; el transporte mueve sobres cerrados. Eso no es una promesa nueva
  del Inspector: es cómo funciona el vault desde siempre, y lo que se comprueba es eso.
- **Lo que viaja es lo que el usuario mandó**, uno a uno. Nunca la lista de hallazgos,
  nunca las rutas de tu disco, nunca un resumen de lo que tienes.
- **La conexión la abre el comando, no la página.** El Node del `npx` es quien habla con
  la bóveda; la UI sigue encerrada en su `default-src 'self'`. Conviene que siga así: la
  página es lo que un día podría cargar algo raro, y no tiene por dónde.

La frase honesta, entonces, es: **«el Inspector no le cuenta a nadie lo que encuentra, y
lo que guardes en tu bóveda viaja cerrado»** — no «el Inspector no se conecta a nada».

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
| **F0** ✅ | Este documento aprobado. Repo, `develop` + `main` protegida (§11.6). |
| **F1** ✅ | `npx @dotrino/inspector` levantando la UI + motor de detección (catálogo §3, **Linux, macOS y Windows**) + **ver**, **descartar** y **la receta para copiar** (§4.3). **Ninguna acción**: no toca la máquina y tampoco escribe en la bóveda. Ya es útil solo. |
| **F2** | Primera acción: **guardar en la bóveda** (§4.2), con la comprobación de colisión. Sigue sin tocar un archivo de la máquina. |
| **F3** | *(Solo si el dueño lo decide)* aplicar la receta por él: escribir el arranque, comprobar y retirar el original. Opt-in y por hallazgo. |
| **F4** ✅ | Landing en `inspector.dotrino.com` (§1.2), página en el wiki (§9.2) y alta en el catálogo (§11.4). La landing **no documenta** (§9.2 endurecido): presenta, promete y enlaza «Cómo instalar» al wiki por cada vía; el `npx`, el instalador universal y las opciones viven en [la página del wiki](https://wiki.dotrino.com/herramientas/inspector/). Vive en `landing/` y no en `web/` —que aquí es la UI local— y se publica por Actions, porque Pages por rama solo sirve `/` o `/docs`. |
| **F5** | Revisar otra máquina del acta. |

F1 se puede publicar solo: **enseñar el problema y decir cómo se arregla ya vale**, aunque
lo aplique el usuario a mano. Y es la manera de comprobar lo único que de verdad hay que
comprobar antes de automatizar nada: que **las recetas sean correctas**. Si el Inspector
las aplicara solo desde el primer día, cada receta equivocada sería un servicio caído en
vez de un comando que no funciona.

## 8. Decisiones tomadas aquí

- Nombre **Dotrino Inspector**; repo `dotrino-inspector`, npm `@dotrino/inspector`,
  subdominio `inspector.dotrino.com` (landing, §1.2).
- Nombres alternativos descartados: `guard`, `sentinel`, `defender`, `watchtower` — todos
  presuponen un antagonista, contra la regla de redacción de `CLAUDE.md`. `audit` promete
  una auditoría que no existe.
- **Se levanta con `npx`** (§2). Sin binario empaquetado, sin instalador, sin Tauri ni SEA: la versión la lleva npm y actualizar es no hacer nada.
- **Sin modo automático**, nunca (§5.6).
- **F1 no ejecuta ninguna acción** (§4): ve, explica y sugiere. No toca archivos, no
  arranca servicios y **tampoco escribe en la bóveda** — eso es F2. Las acciones se
  diseñan ahora porque la receta que se sugiere tiene que ser la que un día se aplique.
- **Los tres sistemas desde F1** (§3): cada tipo declara dónde mira en cada uno; el
  llavero del sistema no es un hallazgo y los permisos de Windows son su propio tipo.
- **El Inspector no rota credenciales** (§4.4): protege con la bóveda, y para lo ya
  filtrado advierte y señala dónde se rota. Rotar es del proveedor.

## 9. Lo que falta decidir

### 9.1. Alcance por defecto del recorrido

Propuesta, salvo que el dueño diga otra cosa: **no `$HOME` entero la primera vez**. Por
defecto se recorren las **ubicaciones conocidas** (`~/.ssh`, `~/.aws`, `~/.npmrc`, historial
del shell… las de la tabla del §3) más **la carpeta de proyectos que el usuario elija**.
`$HOME` completo queda como una opción explícita, con su aviso de que va a tardar. El
motivo: un primer recorrido que se come media hora y saca 400 hallazgos de carpetas que el
usuario no esperaba es la forma más rápida de que cierre la herramienta y no vuelva.

*(Resueltas el 2026-08-24: los tres sistemas entran en F1 (§3); el Inspector sugiere pero
no edita (§4), lo que retira de la mesa la pregunta de cómo verificar un proyecto que no
sabe arrancar solo; y no rota credenciales (§4.4).)*

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
