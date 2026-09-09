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

Verifies that every `url` in `data/nav.yml` points at a page under `docs/`, and that any `#anchor` exists in that page. Runs in CI as part of `.github/workflows/docs-links.yml`, after the [lychee](https://lychee.cli.rs) check of the docs body.

To run it locally you need lychee and jq (`brew install lychee jq`). From the repo root:

```bash
docs/util/check-nav-links.sh
```

Each broken url is reported as `docs/util/data/nav.yml:LINE`. If the page moved, grep `docs/` for a `redirect_from` entry matching the old url to find the new one.

CI runs on Linux, which is case-sensitive, so a url with the wrong capitalization can pass locally on macOS and still fail in CI.

Headings that start with a digit or punctuation get different automatic ids on GitHub and on the docs site, so give such a heading an explicit `{#id}` before linking to it from the nav.
