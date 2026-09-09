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

Checks every link in the markdown under `docs/`, and every `url` in `data/nav.yml`. A nav url has to point at a page under `docs/`, and if it has an `#anchor`, that heading has to exist in the page. CI runs the same checks in `.github/workflows/docs-links.yml`.

Install [lychee](https://lychee.cli.rs) and jq (`brew install lychee jq`), then run from the repo root:

```bash
docs/util/check-links.sh        # both
docs/util/check-links.sh docs   # only the markdown under docs/
docs/util/check-links.sh nav    # only nav.yml
```

Broken nav urls are reported as `docs/util/data/nav.yml:LINE`. If a page moved, the new page usually lists the old url under `redirect_from`, so grep `docs/` for the old url.

A url with the wrong capitalization can pass on macOS and still fail in CI, because Linux filenames are case-sensitive.

If you link to a heading that starts with a digit or punctuation, give the heading an explicit `{#id}` first. GitHub and the docs site generate different ids for those headings.
