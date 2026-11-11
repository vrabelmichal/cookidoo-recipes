# Import the mushroom soup into Cookidoo

This is an **unofficial local uploader**, implemented from PR #2's handoff. The
website URL importer rejected our domain; adding more recipe markup will not
change that. This tool instead uses your own logged-in Created Recipes session.
No cookie, login or account request goes through the public recipe website.

**Verified locally:** offline validation/preview and mocked create, patch,
read-back, error and recovery tests. **Verified against the owner's Polish account:**
read-only access and exact read-back of the imported recipe's title, all 12
ingredients, six steps and saved TM7 model tag. **Not verified:** cooking on an
actual Thermomix or guided actions.
The command fails if the selected host/locale does not return the expected JSON.

Machine times, temperatures, speeds and reverse direction are imported as Polish
**text instructions**. This version does not generate guided device actions.
Review the settings and enter them manually while cooking, or configure them in
the Cookidoo editor yourself. The recipe and uploader now target **TM7**. The
public page at the same root URL also uses the TM7 instructions.

## 1. Open the implementation branch and preview

Install Node.js 22 or newer. No `npm install` or packages are needed. In PowerShell:

```powershell
cd "$HOME\Documents\cookidoo-recipes"
git fetch origin
git switch feat/local-cookidoo-uploader
npm test
npm run validate
npm run preview
```

The preview includes 12 ingredients, six steps, four servings, Polish text and
the safety notes. API times are seconds: preparation 600, overall 2580 (43 min,
within the website's 40–45 min), active machine time 1985 (33 min 5 s).

## 2. Log in and save site cookies locally

1. Log in to **https://cookidoo.pl/** in your own browser. Open **Moje przepisy →
   Utworzone przepisy** and confirm your account can create a recipe. Account
   eligibility, subscription and recipe limits are controlled by Cookidoo.
2. Using a cookie export tool you trust that supports **Netscape cookies.txt**,
   export **only cookies for cookidoo.pl**, including HttpOnly session cookies.
   Choose the Netscape text format, not JSON and not a raw Cookie header.
   Cookie export tools can access your login session, so inspect their access
   before installing/using one. Do not export your entire browser profile.
3. Save the export to **`$HOME\.cookidoo-recipes\cookies.txt`**, outside the
   Git repository and outside any public hosting directory. Create that folder
   first with the following commands. Restrict it to your Windows account:

```powershell
$privateDir = Join-Path $HOME '.cookidoo-recipes'
New-Item -ItemType Directory -Force -Path $privateDir | Out-Null
$account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls $privateDir /inheritance:r /grant:r "${account}:(OI)(CI)F"
```

Do not paste cookies into chat, issues, pull requests, a terminal command, or
the public website. They grant access to your account. The CLI only accepts
domain-scoped exports, filters other domains/expired cookies, and never prints
cookie values. Delete the export after finishing. On macOS/Linux use an equally
private folder (`chmod 700 ~/.cookidoo-recipes`, `chmod 600` on the cookie file).

## 3. Check authentication without creating anything

```powershell
node scripts/cookidoo-upload.mjs check-auth
```

The default target is **cookidoo.pl / pl-PL**. Passing this command confirms a
read-only Created Recipes request returned the expected collection JSON; it does
not prove that your account has remaining recipe capacity or that upload works.
This check is repeated before upload. The tool never follows redirects or changes
locale automatically.

If your account actually uses another supported first-party host, pass it
explicitly on **every** command and export cookies from that host instead:

```powershell
node scripts/cookidoo-upload.mjs check-auth --host cookidoo.international --locale pl-PL --cookies "$HOME\.cookidoo-recipes\cookies.txt"
```

Allowed hosts: `cookidoo.pl`, `cookidoo.international`, `cookidoo.de`.
This version accepts `pl-PL` only. Other-host Polish support is unverified; a
redirect is a stop condition. Do not switch country to bypass an access restriction.

## 4. Import once, then inspect in Cookidoo

After reviewing the preview and confirming the target account:

```powershell
node scripts/cookidoo-upload.mjs upload data/zupa-pieczarkowa-thermomix.json --confirm
```

`--confirm` expressly authorizes creating this recipe in the account represented
by your local cookies. There is no automatic upload when running tests, validate
or preview. The uploader creates one draft, saves its ID locally, patches the
content, then reads it back. It prints the ID and edit link **only after the title
and all ingredient/step text match in order**. The comparison includes the textual
machine settings and safety notes, and verifies the saved TM7 model tag. Separate
API time/yield metadata is not certified by the read-back comparison.

Open the printed link, or open **Moje przepisy → Utworzone przepisy** in your
browser. Check all ingredients, four portions, six steps, reverse direction and
heating precautions. Check the editor's times and selected device as well. Guided
cooking and synchronization to a physical device require separate verification.

The state file is **`$HOME\.cookidoo-recipes\upload-state.json`**. Keep it: running
the same import again verifies the existing recipe and makes no new draft.
This first version deliberately tracks one recipe/target/version at a time. It
does not import arbitrary unrelated recipes into an existing ledger.

## Recovery and troubleshooting

- **401 / 403:** log in again, check account access/capacity and export fresh
  cookies for the selected host. No retry is automatic. If the failure happened
  during POST, follow the uncertain-create guidance below.
- **Redirect / HTML / unrecognized JSON:** the session, host, locale or internal
  API differs. Stop; inspect Cookidoo in your browser. The CLI discards response
  bodies and redirect destinations to avoid disclosing login/session material.
- **PATCH or read-back failed, with a recorded draft ID:** inspect that draft
  first, then retry the same recipe and target explicitly:

  ```powershell
  node scripts/cookidoo-upload.mjs upload data/zupa-pieczarkowa-thermomix.json --resume --confirm
  ```

  This updates the recorded draft, checks its title first and does not POST.
  If read-back already matches the full recipe, resume simply records completion
  without another PATCH. Successful PATCH acknowledgements need not contain JSON;
  completion is determined by the separate recipe read-back.
  Reapplying PATCH can overwrite manual edits in that draft. If read-back still
  differs, finish/check the recipe manually rather than create a second copy.
- **Uncertain create (`status: creating`):** the request may have created a draft
  even if the server returned an error or no ID reached your machine. The tool
  blocks more writes. Inspect Created Recipes and complete any new draft manually.
  Do not delete state and retry blindly. Automatic draft reconciliation is not
  implemented; if you need to reset later, first positively identify/remove any
  incomplete draft in the browser and archive the state outside the repository.
- **Locked:** ensure no uploader is running. After a process crash, remove only
  `upload-state.json.lock` from the private folder. Preserve `upload-state.json`.
- **Changed recipe/target:** the ledger refuses to silently create another copy.
  Finish the original recipe manually before deliberately archiving its ledger.
- **A recipe already created manually, or state lost:** do not start a fresh
  upload until you check the account for duplicates. Protection is local to the
  retained ledger; it cannot identify recipes created elsewhere or on another PC.

## Data and checks

`data/zupa-pieczarkowa-thermomix.json` is version 1 of the recipe format. Times
are integer seconds; `machine.reverse` is a boolean; the final serving step has
no machine action. Validation is in `scripts/recipe.mjs`. An offline test checks
the recipe name, ingredients and six step texts against the visible HTML;
update both together when editing. Tests also pin all five machine settings and
critical safety notes. No website build or path changes are required.

The current fixture matches the **visible** website ingredient labels and step
paragraphs, not the older JSON-LD wording. Each imported step has its short
heading, website paragraph and one settings line using minutes/seconds. General
notes are sent separately as the API's `hints` string; they are not appended to
step 1. JSON-LD now uses the same ingredient labels and step paragraphs. Tests
extract the visible HTML to detect drift and prevent duplicated settings/notes.

The optional `image` field points to the local AI-generated PNG under `assets/`.
After content upload, the CLI gets a signed image authorization from Cookidoo,
uploads the PNG to Vorwerk's Cloudinary account without session cookies, patches
the image reference on the same recipe and checks read-back. Existing images are
preserved. If photo upload fails after content succeeds, rerun the same command
to finish the photo without creating another recipe. The generation prompt is
recorded in `assets/README.md`.

Run `npm test` and `npm run validate` after editing. CI uses mocked transport
only, on Node 22/24 and Windows/Linux. Authenticated commands refuse recognized
CI/Cloudflare environments. Keep all session material outside the repository;
`.gitignore` alone cannot prevent a static host from publishing files.

## Research and limits (2026-11-11)

Inspected the actual source of:

- [cookidoo-recipe-creator upload script](https://github.com/guimatheus92/cookidoo-recipe-creator/blob/a651603451e271986b9232822204bdec77170e2d/scripts/upload-recipe.mjs):
  POST `{recipeName}`, PATCH ingredients/instructions/tools/time/yield, GET
  `recipeContent` with schema.org fields. Its TTS data does not establish reverse
  direction, so this implementation emits no action or ingredient annotations.
- [cookiput client](https://github.com/croeer/cookiput/blob/29a761b3a45b608fec21a676d1e8ae1f1d9d9173/CookidooClient.py):
  independently uses the same create/PATCH pattern with a German account.
- [Official Polish Created Recipes overview](https://cookidoo.pl/foundation/pl/pages/discover-created-recipes)
  and [account requirements](https://support-polska.vorwerk.com/hc/pl/articles/17966009166492-Utworzone-przepisy-i-moje-konto-abonament).
  Official pages describe account/subscription limits, but do not document or
  authorize this internal API. The Polish public site exists; that alone does
  not verify `created-recipes/pl-PL` for an authenticated account.

These references establish a community request format, not live compatibility.
The current full Cookidoo terms could not be retrieved during implementation;
no conclusion about permission under those terms is claimed. Review the current
terms in your account before deciding to use an unofficial internal integration.
No access controls, subscription limits or security challenges are bypassed.
No authenticated request or real upload was performed during the initial implementation;
the later live verification is recorded below.

### Live verification follow-up (2026-11-11)

The owner ran the initial import against `cookidoo.pl / pl-PL`. Its PATCH saved
the content, but the original client incorrectly required JSON in the successful
acknowledgement. With the owner's authorization, an authenticated read-back
confirmed the exact title, all 12 ingredients and all six steps, including the
textual machine settings and safety notes. The response handling now accepts
successful PATCH acknowledgements without JSON. Resume recognizes matching
content and records completion without repeating the write. Device behavior and
automatic guided actions remain unverified.

### TM7 replacement (2026-11-11)

At the owner's request, the canonical recipe, public HTML/JSON-LD and uploader
were adapted for TM7. Ingredients, four portions, times, temperatures and reverse
direction were retained. The TM5 note and basket-on-lid instruction were removed.
TM7 lid/cap, unobstructed steam openings, 2.2 litre maximum fill and soup cooking
limits (at most 100°C and speed 2 after adding stock) follow the
[TM7 manual, pages 5 and 9](https://assets.vorwerk.com/content/dam/general/zendesk-guide/manuals/tm7_2025-04/user%20manual_TM7_11012_V1.0_GB.pdf).
The 120°C steps are the onion/mushroom preparation before adding stock.

After the owner deleted the old TM6 recipe, a read-only check confirmed an empty
Created Recipes collection and HTTP 410 for the old ID. Its local ledger was
archived outside the repository before creating the authorized replacement.
The new upload and exact read-back succeeded, including the saved TM7 model tag.
All 18 offline tests pass. The recipe has not been cooked/tested on a TM7; guided
machine actions are still not generated. Future runs retain the replacement's
ledger and verify the same recipe rather than creating a duplicate.

### Website-matching replacement and photo (2026-11-11)

After the owner deleted the previous import, its ID returned HTTP 410 and the
Created Recipes collection was empty. The replacement has the website's exact
visible ingredient labels and six step paragraphs. Settings occur once per step,
in a separate short line. The first step no longer contains the general notes.
Cookidoo accepted the notes as a separate `hints` string; the rendered recipe and
edit HTML contain the notes (the regular JSON read-back omits this field).
The signed Cloudinary photo upload and image read-back succeeded on the same
replacement recipe. Content/model read-back and all 20 offline tests pass.
