<script setup>
import { computed, onMounted, ref } from 'vue'
import '@dotrino/topbar'
import { messages, detectLang } from './i18n.js'
import { connect, api, scan as runScan } from './api.js'
import Finding from './Finding.vue'

const lang = ref(detectLang())
const t = computed(() => messages[lang.value])

const ctx = ref(null)
const error = ref('')
const busy = ref(false)
const progress = ref('')
const findings = ref([])
const scanned = ref(0)
const ran = ref(false)
const showDismissed = ref(false)

const roots = ref(load('dotrino-inspector-roots', []))
const known = ref(true)
const newRoot = ref('')

const live = computed(() => findings.value.filter(f => !f.dismissed))
const buried = computed(() => findings.value.filter(f => f.dismissed))

function load (key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function save () {
  try { localStorage.setItem('dotrino-inspector-roots', JSON.stringify(roots.value)) } catch {}
}

onMounted(async () => {
  try { ctx.value = await connect() } catch (e) { error.value = String(e.message || e) }
  document.documentElement.lang = lang.value
})

function onLang (e) {
  lang.value = e.detail?.lang === 'en' ? 'en' : 'es'
  document.documentElement.lang = lang.value
}

function addRoot () {
  const v = newRoot.value.trim()
  if (v && !roots.value.includes(v)) { roots.value.push(v); save() }
  newRoot.value = ''
}
function dropRoot (r) {
  roots.value = roots.value.filter(x => x !== r); save()
}

function start () {
  busy.value = true
  error.value = ''
  progress.value = ''
  runScan({ roots: roots.value, known: known.value }, {
    onProgress: p => { progress.value = p.file },
    onDone: d => {
      findings.value = d.findings
      scanned.value = d.scanned
      busy.value = false
      ran.value = true
      progress.value = ''
    },
    onError: e => { error.value = String(e.message || e); busy.value = false }
  })
}

async function setDismissed (f, dismissed) {
  await api(dismissed ? '/api/dismiss' : '/api/undismiss', { id: f.id })
  f.dismissed = dismissed ? { at: new Date().toISOString() } : null
}
</script>

<template>
  <!-- Sin `profile`: el perfil vive en el vault del usuario y hablarle sería salir a la
       red, que es justo lo que el Inspector promete no hacer (DISENO §5.1). Y
       `support-no-count` porque la moneda registra su apertura en el store compartido. -->
  <dotrino-topbar
    no-back
    support-no-count
    :lang="lang"
    support-repo="imdotrino/dotrino-inspector"
    support-discord="https://discord.gg/D648uq7cth"
    @dotrino-lang="onLang">
    <span slot="brand" class="brand">Dotrino <b>Inspector</b></span>
  </dotrino-topbar>

  <main>
    <p v-if="error" class="error">{{ error }}</p>

    <!-- Advertencia que NO se esconde: es lo que enmarca todo lo demás (§5.1). -->
    <p class="only-reads">{{ t.onlyReads }}</p>

    <section class="scope">
      <div class="row">
        <label class="check">
          <input type="checkbox" v-model="known" :disabled="busy">
          <span>{{ t.known }}</span>
        </label>
        <button class="go" :disabled="busy" @click="start" data-testid="scan">
          {{ busy ? t.scanning : (ran ? t.scan : t.scanFirst) }}
        </button>
      </div>

      <ul v-if="roots.length" class="roots">
        <li v-for="r in roots" :key="r">
          <code>{{ r }}</code>
          <button class="link" @click="dropRoot(r)" :disabled="busy">{{ t.remove }}</button>
        </li>
      </ul>

      <form class="row add" @submit.prevent="addRoot">
        <input v-model="newRoot" :placeholder="t.folderPlaceholder"
               :aria-label="t.addFolder" data-testid="root-input">
        <button class="link" type="submit" :disabled="!newRoot.trim()">{{ t.add }}</button>
      </form>
    </section>

    <p v-if="busy && progress" class="progress"><code>{{ progress }}</code></p>

    <template v-if="ran && !busy">
      <p class="summary">{{ t.summary({ n: live.length, files: scanned }) }}</p>

      <p v-if="!live.length" class="empty">
        <b>{{ t.empty }}</b><br><span>{{ t.emptyHint }}</span>
      </p>

      <Finding v-for="f in live" :key="f.id" :finding="f" :t="t" :lang="lang"
               @dismiss="setDismissed(f, true)" />

      <template v-if="buried.length">
        <button class="link more" @click="showDismissed = !showDismissed">
          {{ showDismissed ? t.hideDismissed : t.showDismissed(buried.length) }}
        </button>
        <template v-if="showDismissed">
          <Finding v-for="f in buried" :key="f.id" :finding="f" :t="t" :lang="lang"
                   @undismiss="setDismissed(f, false)" />
        </template>
      </template>
    </template>
  </main>
</template>

<style>
:root {
  color-scheme: dark;
  --bg: #0e1116;
  --panel: #171c24;
  --line: #262e3a;
  --ink: #e7ecf3;
  --dim: #93a1b5;
  --blue: #4c8dff;
  --high: #ff6b6b;
  --medium: #ffb454;
  --low: #7f8ea5;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-tap-highlight-color: transparent;
}
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
main {
  max-width: 62rem;
  margin: 0 auto;
  padding: 1rem 1rem calc(3rem + env(safe-area-inset-bottom));
}
.brand { font-weight: 500; letter-spacing: .2px; }
.brand b { font-weight: 700; }
.only-reads {
  margin: .5rem 0 1.25rem;
  color: var(--dim);
  font-size: .93rem;
}
.error {
  background: #2a1416; border: 1px solid #5b2126; color: #ffb3b3;
  padding: .7rem .9rem; border-radius: .5rem;
}
.scope {
  background: var(--panel); border: 1px solid var(--line);
  border-radius: .7rem; padding: .85rem;
}
.row { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; }
.check { display: flex; gap: .5rem; align-items: center; cursor: pointer; flex: 1 1 auto; }
.go {
  background: var(--blue); color: #06101f; border: 0; font-weight: 650;
  padding: .55rem 1.1rem; border-radius: .5rem; cursor: pointer; font-size: .95rem;
}
.go:disabled { opacity: .55; cursor: default; }
.roots { list-style: none; margin: .75rem 0 0; padding: 0; }
.roots li { display: flex; gap: .6rem; align-items: center; padding: .2rem 0; }
.roots code { color: var(--dim); overflow-wrap: anywhere; }
.add { margin-top: .75rem; }
.add input {
  flex: 1 1 16rem; background: #0d1219; border: 1px solid var(--line);
  color: var(--ink); padding: .5rem .65rem; border-radius: .45rem; font-size: .92rem;
}
.link {
  background: none; border: 0; color: var(--blue); cursor: pointer;
  font-size: .9rem; padding: .2rem .3rem;
}
.link:disabled { opacity: .5; cursor: default; }
.progress { color: var(--dim); font-size: .85rem; overflow-wrap: anywhere; }
.summary { color: var(--dim); margin: 1.5rem 0 .75rem; font-size: .9rem; }
.empty { background: var(--panel); border: 1px solid var(--line); border-radius: .7rem; padding: 1.25rem; }
.empty span { color: var(--dim); }
.more { display: block; margin: 1.25rem auto 0; }
</style>
