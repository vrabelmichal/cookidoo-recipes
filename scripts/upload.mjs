import { buildPayload, fingerprint, verifyReadback } from './recipe.mjs';

export async function upload({ recipe, api, store, confirm = false, resume = false }) {
  if (!confirm) throw new Error('Upload requires --confirm after reviewing the preview.');
  const hash = fingerprint(recipe);
  const key = `${api.base}/${recipe.id}`;
  let state = await store.read();
  if (state && (state.key !== key || state.hash !== hash)) throw new Error('State belongs to a different target or recipe version. Keep it; resolve the existing draft before changing source or account.');
  if (state?.status === 'creating') throw new Error('A previous create has an uncertain outcome. Inspect Created Recipes manually; do not retry or delete the state to create again.');
  if (state && !state.recipeId) throw new Error('Invalid upload state; inspect it locally.');
  if (state && state.status !== 'complete' && !resume) throw new Error('An existing draft is recorded. Use --resume --confirm to finish the same draft.');
  if (!state && resume) throw new Error('No recorded draft to resume.');
  await api.probe(); // Auth/locale/permission probe before any writes.
  if (state?.status === 'complete') {
    verifyReadback(await api.request('GET', state.recipeId), recipe);
    return { recipeId: state.recipeId, url: `${api.base}/${state.recipeId}/edit`, existing: true };
  }
  if (!state) {
    state = { version: 1, key, hash, status: 'creating' };
    await store.write(state); // Persist uncertainty BEFORE sending the only POST.
    const created = await api.request('POST', '', { recipeName: recipe.name });
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(created?.recipeId ?? '')) throw new Error('Create response has no valid recipe ID; inspect Created Recipes manually.');
    state = { ...state, recipeId: created.recipeId, status: 'draft' };
    await store.write(state);
  } else {
    const draft = await api.request('GET', state.recipeId);
    if (draft?.recipeContent?.name !== recipe.name) throw new Error('Recorded draft title differs; refusing to edit it.');
    let matches;
    try { matches = verifyReadback(draft, recipe); }
    catch { matches = false; }
    if (matches) {
      await store.write({ ...state, status: 'complete' });
      return { recipeId: state.recipeId, url: `${api.base}/${state.recipeId}/edit`, existing: true };
    }
  }
  await api.request('PATCH', state.recipeId, buildPayload(recipe));
  verifyReadback(await api.request('GET', state.recipeId), recipe);
  await store.write({ ...state, status: 'complete' });
  return { recipeId: state.recipeId, url: `${api.base}/${state.recipeId}/edit`, existing: false };
}
