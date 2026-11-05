<script setup>
// Una tarjeta por hallazgo: qué es, dónde está, por qué importa y qué hacer.
// Las advertencias (`danger`) van a la vista, nunca detrás de un desplegable (§5.1).
import { computed, ref } from 'vue'

const props = defineProps({
  finding: { type: /** @type {import('vue').PropType<import('./types.js').UiFinding>} */ (Object), required: true },
  t: { type: /** @type {import('vue').PropType<import('./types.js').Messages>} */ (Object), required: true },
  lang: { type: /** @type {import('vue').PropType<'es' | 'en'>} */ (String), required: true }
})
defineEmits(['dismiss', 'undismiss'])

const open = ref(false)
const copied = ref('')

const f = computed(() => props.finding)
const title = computed(() => /** @type {Record<string, string>} */ (props.t.types)[f.value.type] || f.value.type)
const why = computed(() => f.value.why?.[props.lang] || '')
const recipe = computed(() => f.value.recipe)
const steps = computed(() => recipe.value?.steps || [])
const allCode = computed(() => steps.value.filter(s => s.code).map(s => s.code).join('\n'))

// Negrita y `código` del texto de las razones, sin meter un motor de markdown entero.
/** @param {unknown} text */
function rich (text) {
  return String(text || '')
    .replace(/[&<>]/g, c => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

/**
 * @param {string} text
 * @param {string} mark
 */
async function copy (text, mark) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = mark
    setTimeout(() => { copied.value = '' }, 1400)
  } catch { /* sin portapapeles: el texto está a la vista para seleccionarlo */ }
}
</script>

<template>
  <article class="card" :class="[f.severity, { muted: f.dismissed }]"
           :data-finding-id="f.id" :data-type="f.type">
    <header @click="open = !open">
      <span class="sev">{{ t.severity[f.severity] }}</span>
      <div class="head">
        <h2>{{ title }}</h2>
        <p class="where">
          <code>{{ f.file }}</code>
          <template v-if="f.count === 1 && f.line"> · {{ t.line }} {{ f.line }}</template>
          <template v-if="f.count === 1 && f.key"> · <code>{{ f.key }}</code></template>
          <template v-if="f.count > 1"> · {{ t.times(f.count) }}</template>
        </p>
      </div>
      <button class="toggle" :aria-expanded="open ? 'true' : 'false'" :aria-label="title"
              @click.stop="open = !open">{{ open ? '−' : '+' }}</button>
    </header>

    <p class="why" v-html="rich(why)"></p>

    <p v-for="n in f.notes" :key="n.es" class="note" :class="n.level"
       v-html="rich(n[lang])"></p>

    <div v-if="open" class="body">
      <ul v-if="f.count > 1" class="occ">
        <li v-for="o in f.occurrences" :key="o.fingerprint">
          <template v-if="o.line">{{ t.line }} {{ o.line }}</template>
          <template v-if="o.key"> · <code>{{ o.key }}</code></template>
          <template v-if="o.provider"> · {{ o.provider }}</template>
        </li>
      </ul>

      <template v-if="recipe">
        <h3>{{ t.recipe }} — {{ recipe.title[lang] }}</h3>
        <ol class="steps">
          <li v-for="(s, i) in steps" :key="i">
            <p v-if="s.text" v-html="rich(s.text[lang])"></p>
            <div v-if="s.code" class="code">
              <pre>{{ s.code }}</pre>
              <button class="link" @click="copy(s.code, 'step' + i)">
                {{ copied === 'step' + i ? t.copied : t.copy }}
              </button>
            </div>
            <p v-if="s.note" class="hint" v-html="rich(s.note[lang])"></p>
          </li>
        </ol>
        <button v-if="allCode" class="link" @click="copy(allCode, 'all')">
          {{ copied === 'all' ? t.copied : t.copyAll }}
        </button>
      </template>
      <p v-else class="hint">{{ t.noRecipe }}</p>

      <footer>
        <button v-if="!f.dismissed" class="link" data-testid="dismiss"
                @click="$emit('dismiss')">{{ t.dismiss }}</button>
        <button v-else class="link" @click="$emit('undismiss')">{{ t.undismiss }}</button>
      </footer>
    </div>
  </article>
</template>

<style scoped>
.card {
  background: var(--panel); border: 1px solid var(--line);
  border-left: 3px solid var(--low);
  border-radius: .7rem; padding: .85rem 1rem; margin-bottom: .8rem;
}
.card.high { border-left-color: var(--high); }
.card.medium { border-left-color: var(--medium); }
.card.muted { opacity: .55; }
header { display: flex; gap: .75rem; align-items: flex-start; cursor: pointer; }
.head { flex: 1 1 auto; min-width: 0; }
h2 { font-size: 1rem; margin: 0; font-weight: 620; }
h3 { font-size: .92rem; margin: 0 0 .6rem; color: var(--dim); font-weight: 600; }
.sev {
  font-size: .7rem; text-transform: uppercase; letter-spacing: .06em;
  padding: .2rem .45rem; border-radius: .3rem; background: var(--dt-surface-2); color: var(--low);
  white-space: nowrap; margin-top: .15rem;
}
.high .sev { color: var(--high); }
.medium .sev { color: var(--medium); }
.where { margin: .2rem 0 0; color: var(--dim); font-size: .85rem; overflow-wrap: anywhere; }
.toggle {
  background: none; border: 1px solid var(--line); color: var(--dim);
  width: 1.7rem; height: 1.7rem; border-radius: .35rem; cursor: pointer; flex: none;
}
.why { margin: .6rem 0 0; font-size: .93rem; }
.note {
  margin: .55rem 0 0; padding: .5rem .7rem; border-radius: .45rem;
  font-size: .88rem; background: var(--dt-surface-2); border: 1px solid var(--line);
}
.note.danger { border-color: var(--dt-error); background: var(--dt-error-soft); color: var(--dt-error-ink); }
.note.warn { border-color: var(--dt-busy); background: var(--dt-surface-2); color: var(--dt-text); }
.body { margin-top: .9rem; border-top: 1px solid var(--line); padding-top: .85rem; }
.steps { margin: 0; padding-left: 1.2rem; }
.steps li { margin-bottom: .9rem; }
.steps p { margin: 0 0 .35rem; font-size: .92rem; }
.code { display: flex; gap: .5rem; align-items: flex-start; }
pre {
  flex: 1 1 auto; margin: 0; background: var(--dt-surface-3); border: 1px solid var(--line);
  border-radius: .45rem; padding: .55rem .7rem; overflow-x: auto; font-size: .85rem;
}
.hint { color: var(--dim); font-size: .85rem; margin: .3rem 0 0; }
.occ {
  list-style: none; margin: 0 0 .9rem; padding: .5rem .7rem;
  background: var(--dt-surface-2); border: 1px solid var(--line); border-radius: .45rem;
  color: var(--dim); font-size: .85rem;
}
footer { margin-top: .9rem; }
:deep(code) { background: var(--dt-surface-3); padding: .05rem .3rem; border-radius: .25rem; font-size: .88em; }
</style>
