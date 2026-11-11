# Cookidoo recipes

A collection of standalone Thermomix recipe webpages, including structured [`schema.org/Recipe`](https://schema.org/Recipe) metadata for potential URL-based recipe imports.

## Recipe index

The site's homepage at **https://cookidoo-recipes.michalvrabel.sk/** lists all available recipes. Add a root-level HTML file and an index entry for each new recipe.

- [Zupa pieczarkowa z ziemniakami](zupa-pieczarkowa-thermomix.html) — https://cookidoo-recipes.michalvrabel.sk/zupa-pieczarkowa-thermomix.html

## Import into Cookidoo Created Recipes

Cookidoo's website URL importer has rejected this custom domain. Use the
[local uploader instructions](docs/cookidoo-upload.md) for the optional,
unofficial Created Recipes integration. Node.js 22+ is required; no dependencies
need installing. Start with `npm test`, `npm run validate` and `npm run preview`.
Authentication stays outside this repository on your own computer, and an upload
requires `--confirm`. Polish text and all machine settings are preserved as text;
guided device actions remain unverified. The bundled recipe targets TM7, with
adapted lid instructions. Live Polish-account read-back has confirmed its TM7
model tag, title, all ingredients and all step text.

## Deploy to Cloudflare Pages

This repository is a plain static website with no build tools or `recipes/` subdirectory. All recipe pages are at the site root.

1. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and select `vrabelmichal/cookidoo-recipes`.
2. Set **Production branch** to `main`.
3. Set **Framework preset** to `None`, leave **Build command** blank, and use `/` for the **Build output directory** (repository root). If the dashboard requires a build command, use `exit 0`.
4. Deploy and add the custom domain `cookidoo-recipes.michalvrabel.sk` to the Pages project in **Custom domains**. Ensure DNS is configured as Cloudflare requires.

Expected routes after deployment and domain configuration:

- Homepage: https://cookidoo-recipes.michalvrabel.sk/
- Mushroom soup: https://cookidoo-recipes.michalvrabel.sk/zupa-pieczarkowa-thermomix.html

Cloudflare Pages Git integration can also provide preview deployments for PR branches.

## Existing Cloudflare Workers deployment

The connected **Workers Builds** project is named `cookidoo-recipes`. Its
`wrangler.jsonc` explicitly sets that name and serves the existing root HTML
files as static assets. The `.assetsignore` allowlist publishes only `index.html`
and `zupa-pieczarkowa-thermomix.html`; update it when adding a public page.
Uploader scripts, data, documentation and local files are excluded.

For Workers Builds, keep the root directory at the repository root, leave the
build command blank, and use `npx wrangler deploy` as the production deploy
command (`npx wrangler versions upload` for non-production branch previews).
The repository's package name describes the local uploader and is deliberately
different from the deployed Worker name. The config prevents automatic detection
from treating the uploader package name as a new Worker.

Deployment tooling uses a locked Wrangler development dependency. To validate
the config without deploying or authenticating, run `npm ci` followed by
`npm run deploy:check`. The uploader itself still needs no dependency installation.
Keep Cookidoo cookies outside the repository as described in the import guide.

> **Cookidoo:** Public recipe URLs and `schema.org/Recipe` metadata may help import, but support and preservation of Thermomix settings are not guaranteed. Verify imported details before cooking.
