#!/usr/bin/env node
import { readFile, mkdir, open, rename, unlink, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildPayload, validateRecipe } from './recipe.mjs';
import { client, cookieHeader, target } from './cookidoo-client.mjs';
import { upload } from './upload.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = resolve(homedir(), '.cookidoo-recipes');
function outsideRepo(path) {
  const rel = relative(root, path);
  if (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) throw new Error('Keep cookies and upload state outside this repository so static hosting cannot publish them.');
}
async function main() {
  const { positionals: [command, file, ...extra], values } = parseArgs({ allowPositionals: true, options: {
    host: { type: 'string', default: 'cookidoo.pl' }, locale: { type: 'string', default: 'pl-PL' },
    cookies: { type: 'string', default: resolve(local, 'cookies.txt') },
    confirm: { type: 'boolean', default: false }, resume: { type: 'boolean', default: false },
  }});
  if (!['validate', 'preview', 'check-auth', 'upload'].includes(command) || extra.length || (command === 'check-auth' ? file : !file)) {
    throw new Error('Usage: node scripts/cookidoo-upload.mjs validate|preview|upload <recipe.json> OR check-auth [--host cookidoo.pl] [--locale pl-PL] [--cookies <external Netscape file>] [--confirm] [--resume]');
  }
  const base = target(values.host, values.locale);
  let recipe;
  if (file) {
    try { recipe = JSON.parse(await readFile(resolve(file), 'utf8')); }
    catch { throw new Error('Cannot read recipe JSON. Check the path and JSON syntax.'); }
    validateRecipe(recipe);
    console.log(`${recipe.name} | ${recipe.servings} servings | ${recipe.model} | ${recipe.locale}\nTarget: ${base}\nTotal: ${recipe.totalTime}s; preparation: ${recipe.prepTime}s; active machine: ${recipe.steps.reduce((n,s) => n + (s.machine?.seconds ?? 0), 0)}s\nPlain-text settings only; guided machine actions are not generated.`);
    if (command === 'preview' || command === 'upload') console.log(JSON.stringify(buildPayload(recipe), null, 2));
    if (command === 'validate' || command === 'preview') return;
    if (!values.confirm) throw new Error('Upload requires --confirm after reviewing the preview.');
  }
  if (process.env.CI || process.env.CF_PAGES || process.env.GITHUB_ACTIONS) throw new Error('Authenticated commands must run locally, outside CI/Cloudflare.');
  outsideRepo(resolve(values.cookies));
  let raw;
  try { outsideRepo(await realpath(resolve(values.cookies))); raw = await readFile(resolve(values.cookies), 'utf8'); }
  catch { throw new Error('Cannot read cookie file. See docs/cookidoo-upload.md for local login/export instructions.'); }
  const api = client({ host: values.host, locale: values.locale, cookies: cookieHeader(raw, values.host) });
  if (command === 'check-auth') { await api.probe(); console.log(`Read-only authentication check passed: ${base}`); return; }
  outsideRepo(local);
  await mkdir(local, { recursive: true, mode: 0o700 });
  outsideRepo(await realpath(local));
  // A single durable ledger prevents changing filename/host to silently duplicate a draft.
  const stateFile = resolve(local, 'upload-state.json');
  let lock;
  try { lock = await open(`${stateFile}.lock`, 'wx', 0o600); }
  catch { throw new Error('Uploader is locked. If no uploader is running, inspect state and remove only upload-state.json.lock.'); }
  try {
    const store = {
      async read() {
        try {
          const saved = JSON.parse(await readFile(stateFile, 'utf8'));
          if (!saved || saved.version !== 1 || typeof saved.key !== 'string' || !/^[a-f0-9]{64}$/.test(saved.hash) ||
              !['creating', 'draft', 'complete'].includes(saved.status) ||
              (saved.status !== 'creating' && !/^[A-Za-z0-9_-]{1,128}$/.test(saved.recipeId))) throw new Error('Invalid state');
          return saved;
        }
        catch (e) { if (e.code === 'ENOENT') return null; throw new Error('Cannot read upload state. Preserve it and inspect locally.'); }
      },
      async write(state) {
        const temp = `${stateFile}.tmp`;
        const handle = await open(temp, 'w', 0o600);
        try { await handle.writeFile(JSON.stringify(state, null, 2)); await handle.sync(); }
        finally { await handle.close(); }
        await rename(temp, stateFile);
      },
    };
    console.log(JSON.stringify(await upload({ recipe, api, store, confirm: values.confirm, resume: values.resume }), null, 2));
  } finally { await lock.close(); await unlink(`${stateFile}.lock`); }
}
main().catch(error => {
  // Only our bounded, redacted diagnostics are emitted; no stacks or raw causes.
  console.error(error instanceof TypeError || error.code || error instanceof SyntaxError ? 'Local input or filesystem error. Check paths, JSON and access permissions.' : error.message);
  process.exitCode = 1;
});
