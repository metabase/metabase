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

Verifies that every `url` in `data/nav.yml` points at a page under `docs/`, and that any `#anchor` exists in that page. `nav_links.clj` renders the nav as a markdown list of links, and [lychee](https://lychee.cli.rs) (the same link checker CI runs over the docs body) checks that file. Runs in CI as part of `.github/workflows/docs-links.yml`.

To run it locally you need [babashka](https://babashka.org) and lychee (`brew install borkdude/brew/babashka lychee`). From the repo root:

```bash
./bin/mage docs-check-nav-links
```

When a page is missing, the task looks for a `redirect_from` entry matching the old URL elsewhere in `docs/` and suggests the new URL.

macOS filesystems are case-insensitive but the docs site is not, so lychee alone would let a url with the wrong capitalization pass locally and fail in CI. The task checks capitalization separately and reports those as `CASE`.

Headings that start with a digit or punctuation get different automatic ids on GitHub and on the docs site, so give such a heading an explicit `{#id}` before linking to it from the nav.
