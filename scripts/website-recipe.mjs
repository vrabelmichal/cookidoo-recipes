// Extract this repository's visible recipe, not its potentially stale JSON-LD.
const plain = html => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
export function visibleRecipe(html) {
  const ingredients = [...html.match(/<ul class="ingredients">([\s\S]*?)<\/ul>/)[1].matchAll(/<span>(.*?)<\/span>/g)].map(m => plain(m[1]));
  const steps = [...html.matchAll(/<div class="step">([\s\S]*?)(?=<div class="step">|<\/section>)/g)].map(m => {
    const block = m[1];
    return {
      name: plain(block.match(/<h3>(.*?)<\/h3>/)[1]).replace(/^\d+\.\s*/, ''),
      text: plain(block.match(/<p>([\s\S]*?)<\/p>/)[1]),
      settings: [...(block.match(/<div class="settings">(.*?)<\/div>/)?.[1] ?? '').matchAll(/<span>(.*?)<\/span>/g)].map(x => plain(x[1])),
      tip: block.match(/<p class="small">(.*?)<\/p>/)?.[1],
    };
  });
  if (ingredients.length !== 12 || steps.length !== 6) throw new Error('Website recipe markup changed; review extraction.');
  return { ingredients, steps };
}
