# Cookidoo recipes

A collection of standalone Thermomix recipe webpages, including structured [`schema.org/Recipe`](https://schema.org/Recipe) metadata for potential URL-based recipe imports.

## Recipe index

The site's homepage at **https://cookidoo-recipes.michalvrabel.sk/** lists all available recipes. Add a root-level HTML file and an index entry for each new recipe.

- [Zupa pieczarkowa z ziemniakami](zupa-pieczarkowa-thermomix.html) — https://cookidoo-recipes.michalvrabel.sk/zupa-pieczarkowa-thermomix.html

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

> **Cookidoo:** Public recipe URLs and `schema.org/Recipe` metadata may help import, but support and preservation of Thermomix settings are not guaranteed. Verify imported details before cooking.
