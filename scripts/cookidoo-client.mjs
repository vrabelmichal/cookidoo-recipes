const HOSTS = new Set(['cookidoo.pl', 'cookidoo.international', 'cookidoo.de']);
export function target(host = 'cookidoo.pl', locale = 'pl-PL') {
  if (!HOSTS.has(host) || locale !== 'pl-PL') throw new Error('Unsupported target. Use cookidoo.pl, cookidoo.international or cookidoo.de with pl-PL; no automatic locale switching.');
  return `https://${host}/created-recipes/${locale}`;
}

// Only Netscape format has enough domain/path/expiry information to filter safely.
export function cookieHeader(raw, host, now = Date.now() / 1000) {
  target(host);
  const jar = new Map();
  for (let line of raw.split(/\r?\n/)) {
    if (line.startsWith('#HttpOnly_')) line = line.slice(10);
    else if (line.startsWith('#') || !line.trim()) continue;
    const p = line.split('\t');
    if (p.length !== 7) throw new Error('Cookies must be a Netscape cookies.txt export, not a raw Cookie header.');
    const [domain, subdomains, path, secure, expiry, name, value] = p;
    const d = domain.replace(/^\./, '').toLowerCase();
    const matches = host === d || (subdomains === 'TRUE' && host.endsWith(`.${d}`));
    if (!HOSTS.has(d) || !matches || !['TRUE', 'FALSE'].includes(secure) ||
        !['/', '/created-recipes', '/created-recipes/'].includes(path) || !/^\d+$/.test(expiry) ||
        (Number(expiry) !== 0 && Number(expiry) <= now)) continue;
    if (!/^[A-Za-z0-9_!#$%&'*+.^`|~-]+$/.test(name) || !/^[\x21-\x3a\x3c-\x7e]+$/.test(value)) continue;
    jar.set(name, value);
  }
  if (!jar.size) throw new Error('No unexpired Cookidoo-scoped cookies for the selected host. Log in and export that site only.');
  return [...jar].map(([k,v]) => `${k}=${v}`).join('; ');
}

export function client({ host, locale, cookies, fetchImpl = fetch }) {
  const base = target(host, locale);
  return {
    base,
    async request(method, id = '', payload) {
      if (id && !/^[A-Za-z0-9_-]{1,128}$/.test(id) && !(method === 'POST' && id === 'image/signature')) throw new Error('Invalid recipe ID.');
      let response;
      try {
        response = await fetchImpl(`${base}${id ? `/${id}` : ''}`, {
          method, redirect: 'manual', signal: AbortSignal.timeout(20000),
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', Cookie: cookies,
            Origin: `https://${host}`, Referer: `https://${host}/` },
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        });
        if (response.status >= 300 && response.status < 400) throw new Error('redirect');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        // PATCH may acknowledge success with an empty or non-JSON body.
        // The uploader verifies the actual saved content with a separate GET.
        if (method === 'PATCH') {
          await response.body?.cancel();
          return null;
        }
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('expected JSON');
        return await response.json();
      } catch (e) {
        // Never expose response bodies, Location, cookies or transport exceptions.
        const reason = /^HTTP \d{3}$/.test(e.message) || ['redirect', 'expected JSON'].includes(e.message) ? e.message : 'network, timeout or invalid JSON';
        throw new Error(`${method} failed (${reason}). Check login, account access and host/locale; no automatic retries.`, { cause: undefined });
      }
    },
    async probe() {
      const result = await this.request('GET');
      if (!Array.isArray(result?.items)) throw new Error('Unrecognized Created Recipes response; stop and verify the API schema.');
      return result;
    },
  };
}
