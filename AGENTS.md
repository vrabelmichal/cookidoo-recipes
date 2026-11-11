# Coding agent instructions

For the proposed unofficial Cookidoo Created Recipes uploader, start with [docs/HANDOFF_COOKIDOO_UPLOADER.md](docs/HANDOFF_COOKIDOO_UPLOADER.md).

- Treat that document as an implementation specification, not as evidence that the upload currently works.
- The production website uses root-level recipe URLs; do not add a `recipes/` path segment.
- Never commit or expose Cookidoo cookies, bearer tokens, credentials or session material.
- Keep the uploader local-only and opt-in, with offline tests and no authenticated uploads in CI.
- Perform real Cookidoo writes only after the account owner expressly authorizes a specific test.
- Make the actual implementation in a separate pull request and record verification results.
