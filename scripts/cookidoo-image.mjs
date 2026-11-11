import { readFile } from 'node:fs/promises';

// Public client identifiers from Cookidoo's signed Cloudinary upload flow.
// The signature is obtained from Cookidoo; session cookies never go to Cloudinary.
export async function attachImage({ api, recipeId, file, fetchImpl = fetch }) {
  const png = await readFile(file);
  if (png.length < 24 || png.length > 16 * 1024 * 1024 || png.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Recipe image must be a PNG smaller than 16 MB.');
  const params = { timestamp: Math.floor(Date.now()/1000), source: 'uw', custom_coordinates: `0,0,${png.readUInt32BE(16)},${png.readUInt32BE(20)}` };
  const signed = await api.request('POST', 'image/signature', params);
  if (!/^[a-f0-9]{40,128}$/.test(signed?.signature ?? '')) throw new Error('Image signing returned an unexpected format.');
  const form = new FormData();
  for (const [key,value] of Object.entries({ ...params, signature: signed.signature, api_key: '993585863591145', upload_preset: 'prod-customer-recipe-signed' })) form.append(key,String(value));
  form.append('file',new Blob([png],{type:'image/png'}),'zupa-pieczarkowa.png');
  let data;
  try {
    const response = await fetchImpl('https://api-eu.cloudinary.com/v1_1/vorwerk-users-gc/image/upload', { method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error();
    data = await response.json();
  } catch { throw new Error('Photo upload failed; recipe content is saved. No automatic retry was made.'); }
  if (!/^[A-Za-z0-9_/-]+$/.test(data?.public_id ?? '') || !['png','jpg','webp'].includes(data?.format)) throw new Error('Photo upload returned an unexpected image reference.');
  const image = `${data.public_id}.${data.format}`;
  await api.request('PATCH',recipeId,{image,isImageOwnedByUser:false});
  const saved = await api.request('GET',recipeId);
  if (!JSON.stringify(saved.recipeContent?.image ?? '').includes(data.public_id)) throw new Error('Photo read-back differs; inspect the saved recipe.');
  return image;
}
