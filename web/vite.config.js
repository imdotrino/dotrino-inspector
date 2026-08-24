import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { execSync } from 'node:child_process'

// El hash del build a la vista, para poder verificar qué versión sirve (CONVENCIONES §3).
const commitMeta = () => ({
  name: 'commit-meta',
  transformIndexHtml (html) {
    let sha = 'dev'
    try { sha = execSync('git rev-parse --short HEAD').toString().trim() } catch {}
    return html.replace('</head>', `  <meta name="commit" content="${sha}">\n</head>`)
  }
})

export default defineConfig({
  base: './',
  plugins: [vue(), commitMeta()],
  build: { outDir: 'dist', emptyOutDir: true }
})
