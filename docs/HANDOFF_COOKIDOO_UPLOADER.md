# Handoff: local Cookidoo uploader for Git-backed recipes

**Status:** implementation requested; this document specifies work for a coding agent. **No Cookidoo upload has been performed.**

**Date:** 2026-11-11  
**Repository:** `vrabelmichal/cookidoo-recipes`  
**Target:** Polish Cookidoo account / Created Recipes, with explicit user-authorized upload.  
**Initial fixture:** `zupa-pieczarkowa-thermomix.html`  
**Deployment:** Cloudflare Pages or Workers at `https://cookidoo-recipes.michalvrabel.sk/` and `https://cookidoo-recipes.michal-htm.workers.dev/`.

## 1. Background and objective

Cookidoo's URL-import flow rejects the two hosted recipe URLs with the Polish message: **"Importowanie danych z tej strony nie jest obecnie dozwolone"** (the website is not allowed). Changing HTML or schema.org markup cannot resolve a domain allowlist rejection.

Build a **local, opt-in, unofficial uploader** that creates the user's own recipe in Cookidoo **Created Recipes**, using a structured recipe source maintained in this repository. Keep the static public website and root-level recipe URLs unchanged. Do not put authentication in Cloudflare Workers, browser JavaScript on the public pages, GitHub Actions, GitHub secrets, or the repository.

The first goal is reliably converting the existing mushroom soup recipe to structured data and demonstrating a validated local dry run. A real upload is optional and must require the human to log in and explicitly confirm.

## 2. Start here: inspect current files and upstream sources

1. Review `README.md`, `index.html`, and `zupa-pieczarkowa-thermomix.html`. The latter contains `<script type="application/ld+json">` with schema.org `Recipe`, plus the Thermomix machine settings displayed in HTML.
2. Research the current implementations and verify the code, not just README examples:
   - https://github.com/guimatheus92/cookidoo-recipe-creator
   - https://github.com/guimatheus92/cookidoo-recipe-creator/tree/main/scripts
   - https://github.com/croeer/cookiput
3. Their READMEs describe undocumented `POST /created-recipes/{locale}` to create a draft and `PATCH /created-recipes/{locale}/{recipeId}` to attach ingredients, instructions and metadata. Treat all request shapes, hosts, locale codes, annotations and auth behaviors as **unverified until inspected/tested**. Do not blindly copy stale examples.
4. Investigate the actual Polish account host and locale (candidate `pl-PL`, not verified by upstream supported-locale list). Detect redirects and validate using a read-only authenticated probe before any writes. Do not silently switch locales.
5. Check Cookidoo terms and potential incompatibilities, including whether the account permits Created Recipes; document any constraints. No attempts to bypass account permissions or security controls.

## 3. Design decisions

- **Source of truth:** a version-controlled, human-readable JSON recipe specification, stored as `data/zupa-pieczarkowa-thermomix.json` (data files are NOT hosted for credential exchange). Use a documented schema/version. The static recipe page may continue to exist and can later be generated from this source, but do not introduce a breaking frontend build system in the first iteration.
- **CLI:** prefer Node.js (one small dependency-light script, for compatibility with upstream `upload-recipe.mjs`), or justify Python after examining upstream. Example target commands, names may be adjusted:
  - `node scripts/cookidoo-upload.mjs validate data/zupa-pieczarkowa-thermomix.json`
  - `node scripts/cookidoo-upload.mjs check-auth` — read-only, no writes
  - `node scripts/cookidoo-upload.mjs upload data/zupa-pieczarkowa-thermomix.json --confirm` — explicit opt-in
- **Safety first:** default command must not send writes. Show a human-readable preview of name, ingredients, total time, servings, target model, locale and machine actions. Request deliberate confirmation before POST.
- **Authentication:** choose browser-context authenticated requests where practical; otherwise use **local-only** Cookidoo-scoped session cookie material. Read from an environment variable or an ignored, access-restricted local file. Never accept an unrestricted full-browser cookie export without warning and filtering. **Never print, commit, upload, or include session tokens in logs, exceptions, tests, documentation examples or PR comments.**
- **Network boundary:** sends authenticated data only to the confirmed first-party Cookidoo API host. Reject arbitrary host/URL injection, redirects to non-Cookidoo hosts, and insecure HTTP. No remote telemetry. No Cloudflare/CI runtime execution.
- **Failures and retries:** use bounded timeouts; fail on 401/403 and redirects with safe diagnostic messages. Avoid automatic POST retries: a lost response may have created a recipe already. Record returned recipe IDs in a local ignored state file (no tokens) and support explicitly resuming a failed PATCH to avoid duplicate recipes. Do not edit unrelated existing recipes.
- **Read-back:** confirm completion using read-only GET for the returned recipe ID if available, compare title, count/order of ingredients and steps, and settings where exposed. Note that annotations may not be present in read-back.
- **Annotations:** implement ingredient and Thermomix TTS/action annotations only after verifying the exact schema and character-offset semantics from upstream or locally observed requests. Keep an MVP path with readable plain-text steps if annotations prove unstable; report this clearly instead of claiming guided machine actions work.
- **Models:** start with validated TM6-compatible steps; retain model field for TM7/TM5, but never assert automatic guided-device support without actual testing. Do not extrapolate device model temperature limits.
- **Locale:** Polish content stays in Polish. Locale and host must be configurable and confirmed; no hard-coded `de-DE` or `en-US`.
- **Maintainability:** unit-testable pure recipe validation and payload-building functions; isolate API transport and auth; avoid duplicating recipe data between tests and code.

## 4. Required mushroom soup data (initial integration fixture)

Preserve the existing recipe exactly in meaning, with **four servings** and the following entries:
- 500 g pieczarek
- 400 g ziemniaków
- 100 g marchewki
- 100 g cebuli
- 30 g masła
- 800 g bulionu warzywnego lub drobiowego
- 120 g śmietanki 18% lub 30%
- 1 liść laurowy
- 2 ziarna ziela angielskiego
- 1/2 łyżeczki soli (do smaku)
- 1/4 łyżeczki pieprzu
- koperek lub natka pietruszki

**Steps:** (1) chop onion, 5 s / speed 5; (2) sauté onion with butter, 3 min / 120 °C / speed 1; (3) add manually sliced mushrooms, 8 min / 120 °C / reverse speed 1; (4) add diced potatoes, carrot, stock and seasonings, 20 min / 100 °C / reverse speed 1, check softness; (5) add cream, 2 min / 90 °C / reverse speed 1; (6) serve with herbs. Preserve manual actions, reverse-blade flags, and heating/steam safeguards. Do not add machine settings to the non-machine serving step.

For durations, distinguish **active machine time** from the displayed **overall 40–45 min**, and serialize Cookidoo API time fields in their actual expected units (upstream examples show seconds). Preserve notes about not exceeding maximum fill and about tempering sour cream.

If the source HTML and JSON diverge, catch it in a lightweight test or document a deterministic sync strategy. Do not make unreviewed recipe alterations.

## 5. Proposed deliverables (implementation PR, separate from this handoff PR)

- `data/zupa-pieczarkowa-thermomix.json` — canonical recipe fixture with explicit schema version.
- `scripts/cookidoo-upload.mjs` (and small helper modules only if justified) — validate/preview, check-auth, create + patch, read-back, bounded error handling.
- `tests/` — local tests for JSON schema validation, payload mapping, reverse blade and TTS annotations (if supported), Polish characters, locale, redirect handling, auth redaction, duplicate prevention, partial failures, read-back behavior; **no real Cookidoo network calls in CI**.
- `.gitignore` — local `.env`, `cookies*.txt`, `*.secret`, `.cookidoo-upload-state.json` or similar; avoid masking actual source files unintentionally.
- `docs/cookidoo-upload.md` — safe local setup and commands; troubleshooting for 401/403, redirect, wrong locale, partial POST/PATCH.
- Update `README.md` with links, a warning that Cookidoo website URL import remains blocked, and clear statement that upload is an **unofficial, opt-in local integration**.
- Optional: `package.json` with explicit validate/test commands; do not add Cloudflare build requirements.

## 6. Implementation plan / milestones

1. **Research and document:** inspect upstream code and tested request schemas, Polish host/locale feasibility, auth approaches, Terms-related risks. State unknowns, choose minimal implementation.
2. **Offline MVP:** canonical JSON fixture, schema/validation, pure transformation to API payload, CLI validate and preview, fixtures and tests. No authentication needed.
3. **Safe authenticated read-only probe:** locally verify login, host and locale using an approved user session. No network in tests. Fail safely.
4. **Opt-in upload:** explicit confirmation, one POST, one or more PATCH as required, local ID state and recovery, read-back comparison. Start with one recipe only.
5. **Acceptance and documentation:** manually verify the recipe appears under Created Recipes and the Polish text/settings are correct. Test guided use on the actual model separately; do not mark it successful from API response alone.

## 7. Acceptance criteria

- [ ] Existing homepage and recipe URL `/zupa-pieczarkowa-thermomix` continue to work on Cloudflare (do not move pages into a `recipes/` directory).
- [ ] Offline validate/preview runs without Cookidoo credentials and no network writes.
- [ ] JSON fixture retains all quantities, Polish text, six steps, exact reverse-blade semantics, and four servings.
- [ ] Auth is local, scoped, redacted and never exposed in deployed HTML, Git history, logs, or CI.
- [ ] An unauthenticated or unsupported-locale attempt safely fails without creating anything.
- [ ] A write requires explicit human confirmation and targets only the user's own Created Recipes.
- [ ] A successful authenticated test creates exactly one recipe; read-back confirms at least title and step/ingredient content.
- [ ] Interrupted or repeated uploads don't silently create duplicate recipes.
- [ ] Mocked tests pass; docs accurately distinguish verified behavior from assumptions.
- [ ] The user receives the recipe ID and safe Cookidoo link **only if verified**.

## 8. Security and operational boundaries

This is an **unofficial use of an internal API**; its behavior can change, and access may be restricted by Vorwerk. Don't bypass access controls, CAPTCHAs, authentication, rate limits or domain restrictions. Use only the account owner's authenticated Created Recipes actions, at low volume and with opt-in confirmation. The Polish locale remains an open compatibility question. Do not ask the user to paste credentials or cookies into a GitHub issue, chat, PR, or public webpage.

## 9. Handoff prompt for the next coding agent

> Implement the uploader specified in `docs/HANDOFF_COOKIDOO_UPLOADER.md` in a **new implementation branch / PR**. First inspect the current repo and upstream reference implementations. Prioritize a fully tested offline JSON schema and dry-run CLI, followed by a safe, local, opt-in Cookidoo API integration. Never put credentials in repo/Cloudflare/CI. Retain existing root recipe URLs. Check Polish locale/host explicitly, mock external requests in tests, and document all unverified behavior. Do not perform an authenticated upload until the human explicitly approves it.

## 10. References

- https://github.com/guimatheus92/cookidoo-recipe-creator
- https://github.com/guimatheus92/cookidoo-recipe-creator/tree/main/scripts
- https://github.com/croeer/cookiput
- Existing source page: https://cookidoo-recipes.michalvrabel.sk/zupa-pieczarkowa-thermomix

The upstream projects are independent community references; do not present this integration as supported or endorsed by Vorwerk.
