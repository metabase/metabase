---
title: Developing Metabase documentation
---

# Developing Metabase documentation

This page covers how to preview the docs site locally, how to edit and link pages, which docs are auto-generated, and how to validate your changes before opening a PR.

## How the docs are built

The markdown lives in [`docs/`](../). The site itself is a self-contained [Astro](https://astro.build/) app under [`docs-build/`](../../docs-build) that reads `docs/` as a content collection and renders each markdown file as a page. A handful of pages are generated from Metabase source — see [Auto-generated docs](#auto-generated-docs) below.

## Prerequisites

You'll need [Bun](https://bun.sh) installed. The rest of your environment (Node, Java, Clojure) is covered in [Setting up a development environment](devenv.md) and is only required if you want to regenerate the auto-generated docs.

The build orchestration runs under [Babashka](https://babashka.org/) via the [`./bin/mage`](../../bin/mage) wrapper. The wrapper auto-installs `bb` on first run, so you don't need to install it separately.

## Preview the docs locally

From the repo root:

```
bun run docs:dev
```

That starts the Astro dev server with hot reload. Open:

```
http://localhost:4321/docs/latest
```

The `/docs/latest` prefix is the configured base path — pages live underneath it, so the developer guide is at `http://localhost:4321/docs/latest/developers-guide/start`.

`docs:dev` does **not** regenerate the gitignored generated artifacts (typedoc snippets, `docs/api.json`). Pages that transclude those will render a placeholder blockquote and log a build warning, which is harmless when you're editing prose. To preview a build where everything is rendered, run:

```
bun run docs:preview
```

That does a real production build and previews it locally. It uses the `docs-preview` mage task, which lazily regenerates any generated artifacts that are **missing, empty, or older than their source files** (e.g. you edited a `defendpoint` docstring and want the OpenAPI spec to catch up). Hot reruns where nothing has changed are fast.

### If the dev server fails to start

The docs dev server pins to port 4321. If you see a "Port 4321 in use" error, an old `astro dev` process is probably still running — when a terminal is force-quit or crashes, macOS reparents the child node process to `launchd` instead of cleaning it up.

To clear stale dev servers (macOS/Linux):

```
bun run docs:dev:clean
```

That kills any orphaned `docs-build` astro processes. Then re-run `bun run docs:dev`.

## Build the production site

All docs tooling lives under the `./bin/mage docs-*` family:

| Task | Purpose | Bun alias |
|---|---|---|
| `docs-build` | Full production build | `bun run docs:build` |
| `docs-preview` | Lazy-regen build + Astro preview server | `bun run docs:preview` |
| `docs-build-branch <branch>` | Build any branch via a git worktree | — |
| `docs-generate` | Regenerate auto-derived backend docs (API, env vars, config, commands, analytics) | `bun run docs:generate` |
| `docs-generate-embedding` | Regenerate SDK/Embed.js typedoc reference | `bun run docs:generate:embedding` |
| `docs-ensure-generated` | Lazy regen of missing/stale artifacts (composed into `docs-preview`) | — |

The `bun run docs:*` scripts in the repo-root [`package.json`](../../package.json) are thin aliases — both forms do the same thing. Run `./bin/mage <task> --help` to see the full option list for any task. The implementations live in [`mage/src/mage/docs.clj`](../../mage/src/mage/docs.clj).

The common path:

```
bun run docs:build
```

That runs the `docs-build` task, which:

1. Regenerates the embedding SDK docs and the OpenAPI spec from scratch.
2. Installs `docs-build` dependencies.
3. Clears Astro's caches (the markdown content store is keyed by source `mtime` and won't otherwise pick up plugin changes).
4. Builds the static site into `docs-build/dist/`.
5. Emits the `llms.txt` artifacts used for AI indexing.

Two environment variables change the build:

- `DOCS_BASE_PATH` — URL prefix. Defaults to `/docs/latest`, or `/docs/v0.NN` when run from a `release-x.NN.x` branch. Also settable via `--base-path` on `docs-build` / `docs-build-branch`.
- `DOCS_SITE_URL` — absolute site URL used for canonicals and the sitemap. Also settable via `--site-url`.

### Build docs for a specific branch

To build the docs for a branch other than the one currently checked out — for example, to produce `/docs/v0.55` HTML while working on `master` — use:

```
./bin/mage docs-build-branch release-x.55.x
```

This creates a git worktree at `__worktrees/docs-<branch>/`, runs the same build inside it, and copies the result to `build/docs/<version>/` (e.g. `build/docs/v0.55/` or `build/docs/latest/`). The worktree is removed on success; on failure it's retained so you can `cd` in and inspect. To bulk-remove leftover worktrees from past failed runs:

```
./bin/mage docs-clean-worktrees           # list (dry-run)
./bin/mage docs-clean-worktrees --force   # remove all
```

Useful flags:

- `--output <dir>` — override the output directory.
- `--no-fetch` — skip the `git fetch origin <branch>` step (useful for offline work).
- `--keep` — keep the worktree after a successful build for faster re-runs.
- `--base-path <path>` / `--site-url <url>` — pass-throughs for the underlying `DOCS_BASE_PATH` / `DOCS_SITE_URL`.

> **Note:** This branch is a developer-local prototype. There is no CI publishing builds yet — once the destination for the generated HTML is decided, `docs-build-branch` will be the entry point CI uses to build multiple doc versions in parallel.

## Editing pages

Pages are plain markdown with YAML frontmatter:

```yaml
---
title: My new page
redirect_from:
  - /docs/latest/old-path
---
```

Recognized frontmatter fields are `title`, `summary`, and `redirect_from` (an array of old paths to redirect to this page).

Link to other docs with relative markdown links:

```markdown
See [the developer guide](start.md) and [how to build Metabase](build.md).
```

The `rehype-internal-links` plugin rewrites `.md` paths to the right URL at build time, so don't include the file extension in your href if you're worried about it — just write the relative path that points at the file on disk.

The developer guide is a single entry in [`docs-build/nav.yml`](../../docs-build/nav.yml) (it points at [`start.md`](start.md)), so new developer-guide pages don't need a nav edit. Add a link from the right section of [`start.md`](start.md) and you're done. Top-level docs categories (Analytics, Databases, Administration, etc.) do live in `nav.yml`.

## Special markdown syntax

A few build-time tags survive in `docs/` markdown:

### `{% include_file %}`

Transcludes a file (or a named region of one) into the current page:

```
{% include_file "{{ dirname }}/snippets/config/config-base.tsx" %}
{% include_file "{{ dirname }}/snippets/things.md" snippet="introduction" %}
```

`{{ dirname }}` resolves to the directory of the consuming markdown file. The plugin picks the rendering based on the target's extension: `.md` files are parsed as markdown and spliced into the page; source files (`.ts`, `.tsx`, `.py`, …) are rendered as a single fenced code block with the right language for Shiki to highlight.

Snippet markers in the target file:

- Markdown: `<!-- [<snippet NAME>] -->` … `<!-- [<endsnippet NAME>] -->`
- Source code: `// [<snippet NAME>]` … `// [<endsnippet NAME>]`

This is how the SDK docs stay in sync with reality — example code is pulled out of real, type-checked `.tsx` files under `docs/embedding/sdk/snippets/`, and prop tables come straight from generated typedoc output.

### `{SAMPLE_APP_BRANCH}`

Replaced at build time with the branch of the SDK sample-app repo that matches this docs build: `<NN>-stable` on a release branch, `master` otherwise.

### Plans callouts

A blockquote that starts with `> **Plans:**` is styled as a plans callout (the `rehype-blockquote-classes` plugin adds the right CSS class):

```markdown
> **Plans:** Available on Pro and Enterprise plans.
```

## Auto-generated docs

Don't edit these files by hand — your changes will be overwritten the next time the generator runs.

### REST API reference

`docs/api.json` is generated from `defendpoint` docstrings under `src/metabase/**/api/` and rendered at `/docs/api` using the Scalar viewer.

```
./bin/mage docs-generate --api
```

### Environment variables, config template, CLI commands, usage analytics

Generated by the same `docs-generate` task. Each flag scopes regeneration to one output:

| Flag | Output |
|---|---|
| `--env-vars` | `docs/configuring-metabase/environment-variables.md` |
| `--config` | `docs/configuring-metabase/config-template.md` |
| `--api` | `docs/api.json` |
| `--commands` | `docs/installation-and-operation/commands.md` |
| `--analytics` | `docs/usage-and-performance-tools/usage-analytics-reference.md` |

```
./bin/mage docs-generate --env-vars
./bin/mage docs-generate --env-vars --config   # combine flags
./bin/mage docs-generate                        # all of the above
```

Or regenerate everything (API plus the rest):

```
bun run docs:generate
```

Run these when the underlying Clojure source changes, and commit the diff under `docs/` alongside the code change. `docs/api.json` is gitignored and regenerated lazily by `docs-ensure-generated`; the other four files are committed.

### Embedding SDK and Embed.js reference

Typedoc-generated from the SDK's TypeScript types:

```
./bin/mage docs-generate-embedding         # full SDK rebuild + typedoc
./bin/mage docs-generate-embedding --pure  # typedoc only (SDK d.ts files already current)
```

Or:

```
bun run docs:generate:embedding
```

Commit the diffs under `docs/embedding/sdk/api/` and `docs/embedding/eajs/snippets/`. The HTML API reference under `docs-build/public/embedding/sdk/api/` is gitignored and rebuilt on every site build.

## Lint and check

Before opening a PR:

```
bun run docs:check         # Astro/TypeScript check — frontmatter, plugin errors, broken includes
bun run docs:test          # unit tests for the remark plugins
bun run lint-docs-links    # verify in-product docsUrl() references point at real markdown files
```

`docs:check` is the closest thing to a build-time linter for the markdown itself — if a transclusion can't resolve, a plugin throws, or frontmatter is malformed, it'll surface here.

## Marketing-site chrome

Every docs page is wrapped in the metabase.com marketing header (logo, top nav, Get started CTA) and footer (newsletter signup, sitemap, social links). The chrome is **vendored** into this repo as a static snapshot — the docs site does not link to any CSS, JS, or HTML hosted on metabase.com, so the build is fully independent.

What's vendored:

| File | Purpose |
|---|---|
| [`docs-build/src/components/Header.astro`](../../docs-build/src/components/Header.astro) | Renders the snapshot below into a `<header class="bootstrap sticky">`, rewriting `/images/...` paths to live under `${BASE_URL}`. |
| [`docs-build/src/components/Footer.astro`](../../docs-build/src/components/Footer.astro) | Renders the footer snapshot into a `<footer class="body-footer">`. |
| [`docs-build/src/data/header-snapshot.html`](../../docs-build/src/data/header-snapshot.html) | Rendered HTML extracted from `metabase.github.io/_includes/navigation-header.html` and its sub-partials. |
| [`docs-build/src/data/footer-snapshot.html`](../../docs-build/src/data/footer-snapshot.html) | Same, for `_includes/footer.html`. |
| [`docs-build/src/styles/chrome.css`](../../docs-build/src/styles/chrome.css) | Bootstrap 5.0.2 + the `.navigation-header`, `.body-footer`, and `.promo-banner` rules extracted from `metabase.github.io/_site/css/styles.css`, plus `MB-Logo` and the footer utility classes (`Button`/`Button--primary`/`Button--small`, `bordered`, `input-small`, `pseudo-link`, `mini-box`, `mini-circle`, `bg-light-yellow`, `text-dark-yellow`, `flex`, `align-center`, `ml-2`/`mr-1`/`mr-2`) from `main.css`, and a hand-written subset of flexboxgrid `col-xs-*` helpers. |
| [`docs-build/public/js/main-nav.js`](../../docs-build/public/js/main-nav.js) | Hover-highlight + mobile hamburger toggle for the top nav. |
| [`docs-build/public/js/promo-banner.js`](../../docs-build/public/js/promo-banner.js) | Show/dismiss for the promo banner; remembers dismissal in `localStorage` for 7 days. |
| [`docs-build/public/js/status.js`](../../docs-build/public/js/status.js) | Live status indicator in the footer. |
| [`docs-build/public/js/github-stars.js`](../../docs-build/public/js/github-stars.js) | GitHub star count badge in the footer. |
| [`docs-build/public/js/more-resources.js`](../../docs-build/public/js/more-resources.js) | Click-to-expand toggle for the footer's "Choosing Metabase" / "More Resources" lists (flips `.hide` on the wrapper and `.chevron-up` on the chevron). |
| [`docs-build/public/js/snowplow.js`](../../docs-build/public/js/snowplow.js) | Anonymous Snowplow page-view tracking — same `sp.metabase.com` collector and `appId: "anon-www"` the marketing site uses for un-consented tracking. No cookies, server-side IP anonymization, no consent banner needed. The marketing tier (`marketing-snowplow.js`, identifiable + cookies) requires the gdpr-cookie-notice consent flow that we have not vendored. The `<script>` tag is only emitted when `import.meta.env.DEV` is false and `DOCS_DISABLE_ANALYTICS` is unset — so `bun run docs:dev` never tracks, and you can opt a production build out with `DOCS_DISABLE_ANALYTICS=1 bun run docs:build`. |
| [`docs-build/public/images/`](../../docs-build/public/images) | `logo.svg`, `logo-with-wordmark.svg`, `chevron_blue_right.svg`, `icons/Type=Learn.svg`, and `navigation-header/embed.svg` — the only static images the chrome references. |

The logo background-image URL is wired through CSS variables (`--mb-logo-url`, `--mb-logo-wordmark-url`) set inline by `DocsLayout.astro`, so `MB-Logo` resolves against whichever `DOCS_BASE_PATH` the build uses.

What was dropped from the snapshot:

- The promo-banner countdown script (`/js/events/datetime.js`) — not needed for static prose.
- The dynamic "Recent Blog Posts" loop in the Resources flyout — replaced with a single static link to `/blog` so the snapshot doesn't go stale page-by-page.
- The Mailchimp `mc-validate.js` external script and its jQuery `noConflict` snippet — both pull from outside the docs build. The newsletter form still POSTs directly to Mailchimp; HTML5 form validation handles the email field.

### Resyncing the chrome after a marketing-nav change

1. In the `metabase.github.io` checkout, run `bundle exec jekyll build` to refresh `_site/`.
2. Pick any built page that uses the standard `default` layout (e.g. `_site/pricing/index.html`).
3. Extract the header and footer:
   ```
   awk '/<header /,/<\/header>/' _site/pricing/index.html > /tmp/header-snap.html
   awk '/<footer /,/<\/footer>/' _site/pricing/index.html > /tmp/footer-snap.html
   ```
4. Diff the freshly extracted `header-snap.html` and `footer-snap.html` against the committed `docs-build/src/data/header-snapshot.html` and `docs-build/src/data/footer-snapshot.html`. The committed snapshots have already had the following stripped — apply the same removals to your fresh copy before swapping it in:
   - The dynamic "Recent Blog Posts" `{% for post in site.recent-posts %}` loop in the Resources flyout. Replace it with a single `<a href="/blog">Blog</a>` link so the snapshot doesn't go stale page-by-page.
   - The promo-banner countdown `<script>` that loads `/js/events/datetime.js`.
   - The Mailchimp `<script src="//s3.amazonaws.com/.../mc-validate.js">` and the inline jQuery `noConflict` snippet directly under the newsletter form. The form still POSTs to Mailchimp; HTML5 validation handles the email field.
5. Re-extract the chrome CSS rules from `_site/css/styles.css` using the selector allowlist documented at the top of `docs-build/src/styles/chrome.css`, and prepend the MB-Logo block from `_site/css/main.css`.

## Search bar (Inkeep)

The "Search" input in the docs topbar is an [Inkeep](https://inkeep.com/) cxkit-js widget. It's mounted into the `#inkeep` element in [`TopBar.astro`](../../docs-build/src/components/TopBar.astro) by [`docs-build/public/js/inkeep.js`](../../docs-build/public/js/inkeep.js), which pins the CDN version (`@inkeep/cxkit-js@0.5.117`) and holds the widget config (API key, AI assistant prompts, search placeholder). The theme styles live in [`docs-build/public/css/inkeep.css`](../../docs-build/public/css/inkeep.css) and are loaded into cxkit's shadow DOM via `theme.styles` in the config — the `.ikp-*` selectors target debug class names emitted by the widget components. The CSS is vendored from `metabase.github.io/css/inkeep.css` alongside the pinned cxkit version, so a marketing-side update to the search theme means re-vendoring this file the same way as the marketing chrome.

`DocsLayout.astro` writes a small `window.__INKEEP_CONFIG__` object inline in `<head>` so the init script can resolve BASE-prefixed asset paths (the theme stylesheet, AI chat avatars) without hardcoding `/docs/latest`.

The sparkle "What's new" button next to it is a plain link to [https://www.metabase.com/releases](https://www.metabase.com/releases); the icon lives at [`docs-build/public/images/icons/stars.svg`](../../docs-build/public/images/icons/stars.svg).

## Feedback widget

The "Was this helpful?" prompt at the bottom of the right-hand rail is the `FeedbackWidget` component in [`docs-build/src/components/FeedbackWidget.astro`](../../docs-build/src/components/FeedbackWidget.astro). It server-renders static markup — vote buttons, a hidden comment form, and a hidden thank-you message — and is hydrated at runtime by [`docs-build/public/js/feedback-widget.js`](../../docs-build/public/js/feedback-widget.js), which handles vote clicks, POSTs the comment to the CRM endpoint, and computes the "Propose a change" GitHub link from `window.location.pathname` so it always points at the markdown source of the current page.

It's wired into the page by [`DocsLayout.astro`](../../docs-build/src/layouts/DocsLayout.astro) inside the `<aside class="docs-rail">`, directly below the table of contents. Styling lives under the "Feedback widget" section of [`docs-build/src/styles/docs.css`](../../docs-build/src/styles/docs.css).

## Where things live

A short map for when you need to dig deeper than this page goes:

- [`docs/`](../) — all markdown content.
- [`docs-build/astro.config.mjs`](../../docs-build/astro.config.mjs) — markdown pipeline (remark + rehype plugins, Shiki theme), base path, output config.
- [`docs-build/nav.yml`](../../docs-build/nav.yml) — top-level sidebar and topbar nav.
- [`docs-build/src/plugins/`](../../docs-build/src/plugins) — custom remark/rehype plugins:
  - `remark-include-file` — the `{% include_file %}` tag.
  - `remark-docs-version` — the `{SAMPLE_APP_BRANCH}` token.
  - `rehype-internal-links` — relative-link rewriting.
  - `rehype-blockquote-classes` — plans-callout styling.
- [`docs-build/src/lib/nav.ts`](../../docs-build/src/lib/nav.ts) — nav utilities (`findTrail`, `hrefForPage`) consumed by `Sidebar.astro` and `TopBar.astro`. `DocsLayout` walks the nav once per page and shares the resulting trail with both, so breadcrumbs and sidebar expansion stay in sync without a second traversal.
- [`docs-build/src/layouts/DocsLayout.astro`](../../docs-build/src/layouts/DocsLayout.astro) — page chrome wiring (Header above the docs shell, Footer below it, sidebar + topbar + table of contents inside).
- [`docs-build/src/components/`](../../docs-build/src/components) — `Header.astro` and `Footer.astro` (vendored marketing chrome), plus `Sidebar`, `TopBar`, `TableOfContents`, `FeedbackWidget` (docs-internal chrome).
- [`docs-build/src/styles/`](../../docs-build/src/styles) — `chrome.css` (vendored marketing styles) and `docs.css` (docs-internal styles).
- [`mage/src/mage/docs.clj`](../../mage/src/mage/docs.clj) — implementation of the `docs-build`, `docs-build-branch`, `docs-generate`, `docs-generate-embedding`, and `docs-ensure-generated` tasks. Run `./bin/mage <task> --help` for usage.

## Style

Docs are conversational and write to the reader in the second person ("you"). Keep paragraphs short, prefer concrete examples over abstractions, and link liberally to related pages rather than repeating their content.

For broader contribution guidance, see [CONTRIBUTING.md](../../CONTRIBUTING.md). There's also an [older style guide](https://github.com/metabase/metabase/wiki/Writing-style-guide-for-documentation-and-blog-posts-(WIP)) on the wiki — useful for tone reference, though some of it predates the current site.
