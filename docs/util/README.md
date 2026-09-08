# Doc tools

Scripts for generating docs.

## Generate docs for keyboard shortcuts 

From this directory, run:

```bash
bun install
```

Then:

```bash
bun run generate-shortcuts
```
Docs will be written to:

```
docs/exploration-and-organization/keyboard-shortcuts.md
```

## Check nav links

Verifies that every `url` in `data/nav.yml` points at a page under `docs/`, and that any `#anchor` exists in that page. Runs in CI as part of `.github/workflows/docs-links.yml`. To run it locally, from the repo root:

```bash
bun run lint-docs-nav
```
