import { createHash } from 'node:crypto';

const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 20000 && !/[\x00-\x08\x0b-\x1f]/.test(v);
const seconds = v => Number.isSafeInteger(v) && v > 0 && v <= 86400;
export function validateRecipe(r) {
  const require = (ok, message) => { if (!ok) throw new Error(`Invalid recipe: ${message}`); };
  require(r && r.schemaVersion === 1, 'schemaVersion must be 1');
  require(text(r.id) && /^[a-z0-9-]+$/.test(r.id), 'id must be a stable slug');
  require(text(r.name) && r.name.length <= 200, 'name');
  require(r.locale === 'pl-PL', 'this version supports Polish content (pl-PL) only');
  require(r.model === 'TM6', 'this version targets TM6 only');
  require(seconds(r.totalTime) && seconds(r.prepTime) && r.prepTime <= r.totalTime, 'times must be seconds');
  require(Number.isSafeInteger(r.servings) && r.servings > 0 && r.servings <= 100, 'servings');
  require(Array.isArray(r.ingredients) && r.ingredients.length > 0 && r.ingredients.length <= 100 && r.ingredients.every(text), 'ingredients');
  require(Array.isArray(r.notes) && r.notes.every(text), 'notes');
  require(Array.isArray(r.steps) && r.steps.length > 0 && r.steps.length <= 100, 'steps');
  for (const s of r.steps) {
    require(s && text(s.name) && text(s.text), 'step name/text');
    if (s.machine !== undefined) {
      const m = s.machine;
      require(m && seconds(m.seconds) && Number.isFinite(m.speed) && m.speed >= 0.5 && m.speed <= 10 && typeof m.reverse === 'boolean', 'machine duration/speed/reverse');
      require(m.temperature === null || [90, 100, 120].includes(m.temperature), 'unsupported temperature');
      require(!(m.reverse && m.speed > 1), 'reverse above speed 1 is outside this recipe format');
    }
  }
  return r;
}
export function machineText(m) {
  return `${m.seconds} s / ${m.temperature === null ? 'bez podgrzewania' : `${m.temperature}°C`} / obroty ${m.reverse ? 'wsteczne ' : ''}${m.speed}`;
}
export function buildPayload(recipe) {
  const r = validateRecipe(recipe);
  return {
    ingredients: r.ingredients.map(text => ({ type: 'INGREDIENT', text })),
    instructions: r.steps.map((s, i) => ({
      type: 'STEP',
      text: `${s.name}. ${s.text}${s.machine ? ` Ustawienia: ${machineText(s.machine)}.` : ''}${i === 0 && r.notes.length ? ` Uwagi: ${r.notes.join(' ')}` : ''}`,
      // Reverse direction is not established by the upstream TTS schema.
      // Preserve ALL settings as text rather than emit potentially unsafe actions.
      annotations: [],
    })),
    tools: [r.model], totalTime: r.totalTime, prepTime: r.prepTime,
    yield: { value: r.servings, unitText: 'portion' },
  };
}
export const fingerprint = r => createHash('sha256').update(JSON.stringify({ name: r.name, ...buildPayload(r) })).digest('hex');

export function verifyReadback(body, recipe) {
  const rc = body?.recipeContent;
  const p = buildPayload(recipe);
  const ingredients = rc?.recipeIngredient?.map(x => typeof x === 'string' ? x : x.text);
  const steps = rc?.recipeInstructions?.map(x => typeof x === 'string' ? x : x.text);
  if (rc?.name !== recipe.name || JSON.stringify(ingredients) !== JSON.stringify(p.ingredients.map(x => x.text)) ||
      JSON.stringify(steps) !== JSON.stringify(p.instructions.map(x => x.text))) {
    throw new Error('Read-back mismatch: inspect the saved recipe in Cookidoo; do not create another draft.');
  }
  return true;
}
