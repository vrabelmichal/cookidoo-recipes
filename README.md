# Cookidoo recipes

A collection of standalone Thermomix recipe webpages, including structured [`schema.org/Recipe`](https://schema.org/Recipe) metadata for potential URL-based recipe imports.

## Recipes

- [Zupa pieczarkowa z ziemniakami](recipes/zupa-pieczarkowa-thermomix.html)

## Deploy to Cloudflare Pages

This repository is a plain static website and requires no build tooling.

1. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and select `vrabelmichal/cookidoo-recipes`.
2. Select **Production branch:** `main`.
3. Use **Framework preset:** `None`; **Build command:** leave blank; **Build output directory:** `/` (the repository root). If the dashboard requires a build command, use `exit 0`.
4. Deploy. Cloudflare Pages will serve `index.html` as the homepage, and each recipe from its path under `recipes/`.

Recipe URL after deployment:

`https://<your-pages-domain>/recipes/zupa-pieczarkowa-thermomix.html`

Cloudflare Pages will normally deploy the `main` branch to production and create preview deployments for pull-request branches when Git integration is enabled.

> **Cookidoo:** Having public recipe URLs and `schema.org/Recipe` metadata may help import, but Cookidoo import support and preservation of Thermomix device settings are not guaranteed. Verify imported details before cooking.
