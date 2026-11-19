// Monta a pasta dist/ para o Cloudflare Pages (modo avançado):
//   dist/              -> arquivos estáticos (public/)
//   dist/_worker.js/   -> código do servidor (src/), entrada em index.js
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
cpSync('public', 'dist', { recursive: true });
mkdirSync('dist/_worker.js', { recursive: true });
for (const file of readdirSync('src')) {
  if (file.endsWith('.js')) cpSync(`src/${file}`, `dist/_worker.js/${file}`);
}
console.log('dist/ pronto');
