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

## Check links

Checks every link in the markdown under `docs/`, and every `url` in `data/nav.yml`: that each nav url points at a page under `docs/`, and that any `#anchor` exists in that page. CI runs the same checks in `.github/workflows/docs-links.yml`.

To run it locally you need [lychee](https://lychee.cli.rs) and jq (`brew install lychee jq`). From the repo root:

```bash
docs/util/check-links.sh        # both
docs/util/check-links.sh docs   # only the markdown under docs/
docs/util/check-links.sh nav    # only nav.yml
```

Each broken nav url is reported as `docs/util/data/nav.yml:LINE`. If the page moved, grep `docs/` for a `redirect_from` entry matching the old url to find the new one.

CI runs on Linux, which is case-sensitive, so a url with the wrong capitalization can pass locally on macOS and still fail in CI.

Headings that start with a digit or punctuation get different automatic ids on GitHub and on the docs site, so give such a heading an explicit `{#id}` before linking to it from the nav.
