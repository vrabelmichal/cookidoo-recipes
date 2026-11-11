import { createHash } from 'node:crypto';

const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 20000 && !/[\x00-\x08\x0b-\x1f]/.test(v);
const seconds = v => Number.isSafeInteger(v) && v > 0 && v <= 86400;
export function validateRecipe(r) {
  const require = (ok, message) => { if (!ok) throw new Error(`Invalid recipe: ${message}`); };
  require(r && r.schemaVersion === 1, 'schemaVersion must be 1');
  require(text(r.id) && /^[a-z0-9-]+$/.test(r.id), 'id must be a stable slug');
  require(text(r.name) && r.name.length <= 200, 'name');
  require(r.locale === 'pl-PL', 'this version supports Polish content (pl-PL) only');
  require(r.model === 'TM7', 'this version targets TM7 only');
  require(r.image === undefined || r.image === 'assets/zupa-pieczarkowa.png', 'unsupported local image path');
  require(seconds(r.totalTime) && seconds(r.prepTime) && r.prepTime <= r.totalTime, 'times must be seconds');
  require(Number.isSafeInteger(r.servings) && r.servings > 0 && r.servings <= 100, 'servings');
  require(Array.isArray(r.ingredients) && r.ingredients.length > 0 && r.ingredients.length <= 100 && r.ingredients.every(text), 'ingredients');
  require(Array.isArray(r.notes) && r.notes.every(text), 'notes');
  require(Array.isArray(r.steps) && r.steps.length > 0 && r.steps.length <= 100, 'steps');
  for (const s of r.steps) {
    require(s && text(s.name) && text(s.text), 'step name/text');
    require(Array.isArray(s.ingredientSpans) && s.ingredientSpans.every(span => text(span) && s.text.includes(span)), 'ingredient annotations must match step text');
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
  const minutes = m.seconds % 60 === 0;
  const value = minutes ? m.seconds / 60 : m.seconds;
  const plural = new Intl.PluralRules('pl').select(value);
  const unit = minutes ? { one: 'minuta', few: 'minuty', many: 'minut' } : { one: 'sekunda', few: 'sekundy', many: 'sekund' };
  return `${value} ${unit[plural] ?? (minutes ? 'minut' : 'sekund')}${m.temperature === null ? '' : ` / ${m.temperature}°C`} / Obroty ${m.reverse ? 'wsteczne ' : ''}${m.speed}`;
}
export function buildPayload(recipe) {
  const r = validateRecipe(recipe);
  return {
    ingredients: r.ingredients.map(text => ({ type: 'INGREDIENT', text })),
    instructions: r.steps.map(s => {
      const text = `${s.name}\n${s.text}${s.machine ? `\n${machineText(s.machine)}` : ''}`;
      let cursor = s.name.length + 1;
      const annotations = s.ingredientSpans.map(description => {
        const offset = text.indexOf(description, cursor);
        if (offset < 0) throw new Error('Ingredient spans must appear in step order.');
        cursor = offset + description.length;
        return { type:'INGREDIENT',data:{description},position:{offset,length:description.length} };
      });
      if (s.machine) {
        const m=s.machine;
        const label=machineText(m);
        annotations.push({type:'TTS',data:{speed:String(m.speed),time:m.seconds,
          ...(m.reverse ? {direction:'CCW'} : {}),
          ...(m.temperature === null ? {} : {temperature:{value:String(m.temperature),unit:'C'}})},
          position:{offset:text.length-label.length,length:label.length}});
      }
      return {type:'STEP',text,annotations};
    }),
    hints: r.notes.join('\n\n'),
    tools: [r.model], totalTime: r.totalTime, prepTime: r.prepTime,
    yield: { value: r.servings, unitText: 'portion' },
  };
}
export const fingerprint = r => createHash('sha256').update(JSON.stringify({ name: r.name, ...buildPayload(r) })).digest('hex');

export function verifyRenderedAnnotations(html, recipe) {
  const content = value => value.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim();
  const actualIngredients = [...html.matchAll(/<cr-ingredient\b[^>]*>([\s\S]*?)<\/cr-ingredient>/g)].map(m=>content(m[1]));
  const actualSettings = [...html.matchAll(/<cr-tts\b[^>]*>([\s\S]*?)<\/cr-tts>/g)].map(m=>content(m[1]));
  if (JSON.stringify(actualIngredients)!==JSON.stringify(recipe.steps.flatMap(s=>s.ingredientSpans)) ||
      JSON.stringify(actualSettings)!==JSON.stringify(recipe.steps.filter(s=>s.machine).map(s=>machineText(s.machine)))) {
    throw new Error('Saved ingredient/settings actions do not match. Inspect the recipe before cooking.');
  }
  return true;
}

export function verifyReadback(body, recipe) {
  const rc = body?.recipeContent;
  const p = buildPayload(recipe);
  const ingredients = rc?.recipeIngredient?.map(x => typeof x === 'string' ? x : x.text);
  const steps = rc?.recipeInstructions?.map(x => typeof x === 'string' ? x : x.text);
  const tools = rc?.tool?.map(x => typeof x === 'string' ? x : x.name);
  if (rc?.name !== recipe.name || JSON.stringify(ingredients) !== JSON.stringify(p.ingredients.map(x => x.text)) ||
      JSON.stringify(steps) !== JSON.stringify(p.instructions.map(x => x.text)) || !tools?.includes(recipe.model)) {
    throw new Error('Read-back mismatch: inspect the saved recipe in Cookidoo; do not create another draft.');
  }
  return true;
}
