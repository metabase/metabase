---
title: Developing Metabase documentation
---

# Developing Metabase documentation

The markdown lives in [`docs/`](../). The site is a self-contained [Astro](https://astro.build/) app under [`docs-build/`](../../docs-build) that renders each markdown file as a page. Builds are orchestrated by `./bin/mage docs-*` tasks; `bun run docs:*` aliases in the root [`package.json`](../../package.json) shell out to them.

## Prerequisites

You'll need [Bun](https://bun.sh) installed. The rest of the environment (Node, Java, Clojure) is covered in [Setting up a development environment](devenv.md), and is only required if you want to regenerate the auto-generated docs.

The build orchestration runs under [Babashka](https://babashka.org/) via the [`./bin/mage`](../../bin/mage) wrapper, which auto-installs `bb` on first run.

## Preview the docs locally

```
bun run docs:dev
```

That starts the Astro dev server with hot reload at [http://localhost:4321/docs/latest](http://localhost:4321/docs/latest). Pages live underneath that base path — for example, this page is at `http://localhost:4321/docs/latest/developers-guide/docs`.

`docs:dev` doesn't regenerate the gitignored auto-generated artifacts. Pages that transclude them render a placeholder blockquote, which is fine for editing prose. To preview a build with everything rendered:

```
bun run docs:preview
```

That lazily regenerates any missing artifacts (typedoc, OpenAPI spec) and runs a real production build.

If the dev server fails with "Port 4321 in use," an old `astro dev` process is probably still running:

```
bun run docs:dev:clean
```

Then re-run `bun run docs:dev`.

## Build the production site

| Task                         | Purpose                                   | Bun alias                         |
| ---------------------------- | ----------------------------------------- | --------------------------------- |
| `docs-build`                 | Full production build                     | `bun run docs:build`              |
| `docs-preview`               | Lazy-regen build + preview server         | `bun run docs:preview`            |
| `docs-build-branch <branch>` | Build any branch via a git worktree       | —                                 |
| `docs-generate`              | Regenerate auto-derived backend docs      | `bun run docs:generate`           |
| `docs-generate-embedding`    | Regenerate SDK/Embed.js typedoc reference | `bun run docs:generate:embedding` |

Run `./bin/mage <task> --help` for the full option list. The implementations live in [`mage/src/mage/docs.clj`](../../mage/src/mage/docs.clj).

The common path is `bun run docs:build`. That regenerates the embedding SDK docs and OpenAPI spec from scratch, installs `docs-build` dependencies, clears Astro's caches, builds the static site into `docs-build/dist/`, and emits the `llms.txt` artifacts used for AI indexing.

Two environment variables change the build:

- `DOCS_BASE_PATH`: URL prefix. Defaults to `/docs/latest`, or `/docs/v0.NN` on a `release-x.NN.x` branch. Settable via `--base-path`.
- `DOCS_SITE_URL`: absolute site URL used for canonicals and the sitemap. Settable via `--site-url`.

### Build docs for a release branch

To build a different version of the docs without switching branches:

```
./bin/mage docs-build-branch release-x.55.x
```

That creates a git worktree at `__worktrees/docs-<branch>/`, builds inside it, and copies the result to `build/docs/v0.55/`. The worktree is removed on success and retained on failure for debugging. To bulk-remove leftover worktrees: `./bin/mage docs-clean-worktrees --force`.

Useful flags:

- `--output <dir>`: override the output directory.
- `--no-fetch`: skip the `git fetch` step.
- `--keep`: keep the worktree after a successful build.

## Editing pages

Pages are plain markdown with YAML frontmatter:

```yaml
---
title: My new page
redirect_from:
  - /docs/latest/old-path
---
```

Recognized frontmatter fields are `title`, `summary`, and `redirect_from`.

Link to other docs with relative markdown links:

```markdown
See [the developer guide](start.md) and [how to build Metabase](build.md).
```

The build rewrites `.md` paths to the right URL automatically.

The developer guide is a single entry in [`docs-build/nav.yml`](../../docs-build/nav.yml) pointing at [`start.md`](start.md), so new developer-guide pages don't need a nav edit — just add a link from the right section of `start.md`. Top-level docs categories (Analytics, Databases, Administration, etc.) do live in `nav.yml`.

## Special markdown syntax

A few build-time tags survive in `docs/` markdown.

### `{% include_file %}`

Transcludes a file (or a named region of one) into the current page:

```
{% include_file "{{ dirname }}/snippets/config/config-base.tsx" %}
{% include_file "{{ dirname }}/snippets/things.md" snippet="introduction" %}
```

`{{ dirname }}` resolves to the consuming markdown file's directory. Markdown files are spliced into the page; source files (`.ts`, `.tsx`, `.py`, …) are rendered as a syntax-highlighted code block.

Snippet markers in the target file:

- Markdown: `<!-- [<snippet NAME>] -->` … `<!-- [<endsnippet NAME>] -->`
- Source code: `// [<snippet NAME>]` … `// [<endsnippet NAME>]`

This is how the SDK docs stay in sync — example code is pulled out of real, type-checked `.tsx` files under `docs/embedding/sdk/snippets/`.

### `{SAMPLE_APP_BRANCH}`

Replaced at build time with the SDK sample-app branch matching the current docs version: `<NN>-stable` on a release branch, `master` otherwise.

### Plans callouts

A blockquote that starts with `> **Plans:**` is styled as a plans callout:

```markdown
> **Plans:** Available on Pro and Enterprise plans.
```

## Auto-generated docs

Don't edit these files by hand — your changes will be overwritten the next time the generator runs.

The REST API reference at `docs/api.json` is generated from `defendpoint` docstrings under `src/metabase/**/api/` and rendered at `/docs/api`.

Other auto-generated files are regenerated by the `docs-generate` task. Each flag scopes regeneration to one output:

| Flag          | Output                                                          |
| ------------- | --------------------------------------------------------------- |
| `--env-vars`  | `docs/configuring-metabase/environment-variables.md`            |
| `--config`    | `docs/configuring-metabase/config-template.md`                  |
| `--api`       | `docs/api.json`                                                 |
| `--commands`  | `docs/installation-and-operation/commands.md`                   |
| `--analytics` | `docs/usage-and-performance-tools/usage-analytics-reference.md` |

```
./bin/mage docs-generate --env-vars       # one slice
./bin/mage docs-generate --env-vars --config   # combine flags
bun run docs:generate                      # regenerate everything
```

Run these when the underlying Clojure source changes, and commit the diff under `docs/` alongside the code change. `docs/api.json` is gitignored and regenerated lazily; the other four are committed.

The embedding SDK and Embed.js reference is typedoc-generated:

```
./bin/mage docs-generate-embedding         # full SDK rebuild + typedoc
./bin/mage docs-generate-embedding --pure  # typedoc only (faster, when SDK d.ts is current)
```

Commit the diffs under `docs/embedding/sdk/api/` and `docs/embedding/eajs/snippets/`.

## Lint and check

Before opening a PR:

```
bun run docs:check         # Astro/TypeScript check — frontmatter, plugin errors, broken includes
bun run docs:test          # unit tests for the remark plugins
bun run lint-docs-links    # verify in-product docsUrl() references point at real markdown files
```

`docs:check` is the closest thing to a build-time linter for the markdown itself.

## Marketing chrome, search, and feedback widget

The metabase.com header, footer, and Inkeep search bar are vendored as static snapshots — the docs site doesn't depend on anything hosted on metabase.com at build or runtime. The "Was this helpful?" feedback widget renders into the right-hand rail and POSTs to the CRM endpoint. If you need to touch any of this, see the `docs-build` skill in [`.claude/skills/docs-build/SKILL.md`](../../.claude/skills/docs-build/SKILL.md).

## Style

Docs are conversational and write to the reader in the second person ("you"). Keep paragraphs short, prefer concrete examples over abstractions, and link liberally to related pages rather than repeating their content.

For broader contribution guidance, see [CONTRIBUTING.md](../../CONTRIBUTING.md).
