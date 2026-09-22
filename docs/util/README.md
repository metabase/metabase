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
docs/util/check-links.sh                   # both
docs/util/check-links.sh docs              # only the markdown under docs/
docs/util/check-links.sh nav               # only nav.yml
docs/util/check-links.sh --external [nav]  # also fetch links to other sites
```

By default (and in CI) links to other sites are skipped, so the check is fast and works offline. Run it with `--external` now and then to catch external links that have gone dead. It's slower, and a busy site can answer with a 429, which lychee counts as fine.

Some sites can't be checked at all: they block anything that isn't a browser, sit behind a login, or render the page in JavaScript so lychee can't see the `#anchor`. Those are listed under `exclude` in `.lychee/config.toml`, each with a comment saying why. If `--external` flags a link that works in a browser, add it there rather than removing the link.

Broken nav urls are reported as `docs/util/data/nav.yml:LINE`. If a page moved, the new page usually lists the old url under `redirect_from`, so grep `docs/` for the old url.

A url with the wrong capitalization can pass on macOS and still fail in CI, because Linux filenames are case-sensitive.

If you link to a heading that starts with a digit or punctuation, give the heading an explicit `{#id}` first. GitHub and the docs site generate different ids for those headings.
