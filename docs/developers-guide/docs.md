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

That does a real production build and previews it locally, lazily regenerating any missing generated artifacts via `./bin/mage docs-ensure-generated` on first run.

## Build the production site

All docs tooling lives under the `./bin/mage docs-*` family:

| Task | Purpose | Bun alias |
|---|---|---|
| `docs-build` | Full production build | `bun run docs:build` |
| `docs-build-branch <branch>` | Build any branch via a git worktree | — |
| `docs-generate` | Regenerate auto-derived backend docs (API, env vars, config, commands, analytics) | `bun run docs:generate` |
| `docs-generate-embedding` | Regenerate SDK/Embed.js typedoc reference | `bun run docs:generate:embedding` |
| `docs-ensure-generated` | Lazy regen of missing artifacts (used by `bun run docs:preview`) | — |

The `bun run docs:*` scripts in [`package.json`](../../package.json) are thin aliases — both forms do the same thing. Run `./bin/mage <task> --help` to see the full option list for any task. The implementations live in [`mage/src/mage/docs.clj`](../../mage/src/mage/docs.clj).

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

This creates a git worktree at `__worktrees/docs-<branch>/`, runs the same build inside it, and copies the result to `build/docs/<version>/` (e.g. `build/docs/v0.55/` or `build/docs/latest/`). The worktree is removed on success; on failure it's retained so you can `cd` in and inspect.

Useful flags:

- `--output <dir>` — override the output directory.
- `--no-fetch` — skip the `git fetch origin <branch>` step (useful for offline or CI).
- `--keep` — keep the worktree after a successful build for faster re-runs.
- `--base-path <path>` / `--site-url <url>` — pass-throughs for the underlying `DOCS_BASE_PATH` / `DOCS_SITE_URL`.

This is the entry point CI uses to build multiple doc versions in parallel.

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

Generated by the same `docs-generate` task. You can pick which sections to run with flags:

```
./bin/mage docs-generate --env-vars
./bin/mage docs-generate --config
./bin/mage docs-generate --commands
./bin/mage docs-generate --analytics
```

Or regenerate everything (API plus the rest):

```
bun run docs:generate
```

Run these when the underlying Clojure source changes, and commit the diff under `docs/` alongside the code change.

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
- [`docs-build/src/layouts/DocsLayout.astro`](../../docs-build/src/layouts/DocsLayout.astro) — page chrome (sidebar, topbar, table of contents).
- [`mage/src/mage/docs.clj`](../../mage/src/mage/docs.clj) — implementation of the `docs-build`, `docs-build-branch`, `docs-generate`, `docs-generate-embedding`, and `docs-ensure-generated` tasks. Run `./bin/mage <task> --help` for usage.

## Style

Docs are conversational and write to the reader in the second person ("you"). Keep paragraphs short, prefer concrete examples over abstractions, and link liberally to related pages rather than repeating their content.

For broader contribution guidance, see [CONTRIBUTING.md](../../CONTRIBUTING.md). There's also an [older style guide](https://github.com/metabase/metabase/wiki/Writing-style-guide-for-documentation-and-blog-posts-(WIP)) on the wiki — useful for tone reference, though some of it predates the current site.
