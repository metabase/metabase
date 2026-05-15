---
title: Developing Metabase documentation
---

# Developing Metabase documentation

The markdown lives in [`docs/`](../). The site is a self-contained [Astro](https://astro.build/) app under [`docs-build/`](../../docs-build) that renders each markdown file as a page. Builds are orchestrated by `./bin/mage docs-*` tasks (mage runs under [Babashka](https://babashka.org/); the [`./bin/mage`](../../bin/mage) wrapper auto-installs `bb` on first run), and the `bun run docs:*` aliases in the root [`package.json`](../../package.json) shell out to them.

You'll need [Bun](https://bun.sh). The rest of the [dev environment](devenv.md) is only required for the auto-generated docs.

## Preview the docs locally

```
bun run docs:dev
```

Starts the Astro dev server with hot reload at [http://localhost:4321/docs/latest](http://localhost:4321/docs/latest). If port 4321 is in use, run `bun run docs:dev:clean` and retry.

`docs:dev` skips the gitignored auto-generated artifacts — pages that transclude them render a placeholder, which is fine for editing prose. For a full preview that regenerates lazily:

```
bun run docs:preview
```

## Build the production site

| Task                         | Purpose                                   | Bun alias                         |
| ---------------------------- | ----------------------------------------- | --------------------------------- |
| `docs-build`                 | Full production build                     | `bun run docs:build`              |
| `docs-preview`               | Lazy-regen build + preview server         | `bun run docs:preview`            |
| `docs-build-branch <branch>` | Build any branch via a git worktree       | —                                 |
| `docs-generate`              | Regenerate auto-derived backend docs      | `bun run docs:generate`           |
| `docs-generate-embedding`    | Regenerate SDK/Embed.js typedoc reference | `bun run docs:generate:embedding` |

Run `./bin/mage <task> --help` for options. Implementations live in [`mage/src/mage/docs.clj`](../../mage/src/mage/docs.clj). Two env vars override the inferred defaults — `DOCS_BASE_PATH` (URL prefix; defaults to `/docs/latest`, or `/docs/v0.NN` on a `release-x.NN.x` branch) and `DOCS_SITE_URL` (absolute site URL for canonicals/sitemap). You can also pass `--base-path` / `--site-url`.

### Build docs for a release branch

```
./bin/mage docs-build-branch release-x.55.x
```

Creates a worktree at `__worktrees/docs-<branch>/`, builds inside it, and copies the result to `build/docs/v0.55/`. The worktree is removed on success and kept on failure for debugging — use `./bin/mage docs-clean-worktrees --force` to bulk-remove leftovers.

## Editing pages

Pages are plain markdown. Recognized frontmatter fields are `title`, `summary`, and `redirect_from`:

```yaml
---
title: My new page
redirect_from:
  - /docs/latest/old-path
---
```

Link to other docs with relative markdown links — `.md` paths are rewritten to the right URL automatically:

```markdown
See [the developer guide](start.md) and [how to build Metabase](build.md).
```

The developer guide is a single entry in [`docs-build/nav.yml`](../../docs-build/nav.yml) pointing at [`start.md`](start.md), so new developer-guide pages don't need a nav edit — just link from the right section of `start.md`. Top-level categories (Analytics, Databases, Administration, etc.) do live in `nav.yml`.

## Special markdown syntax

### `{% include_file %}`

Transcludes a file (or a named region of one):

```
{% include_file "{{ dirname }}/snippets/config/config-base.tsx" %}
{% include_file "{{ dirname }}/snippets/things.md" snippet="introduction" %}
```

`{{ dirname }}` resolves to the consuming file's directory. Markdown is spliced in; source files (`.ts`, `.tsx`, `.py`, …) render as syntax-highlighted code blocks. Snippet markers: `<!-- [<snippet NAME>] -->` … `<!-- [<endsnippet NAME>] -->` for markdown, `// [<snippet NAME>]` … `// [<endsnippet NAME>]` for source. This keeps the SDK docs in sync — example code is pulled from real, type-checked `.tsx` files under `docs/embedding/sdk/snippets/`.

### `{SAMPLE_APP_BRANCH}`

Replaced at build time with the SDK sample-app branch matching the current docs version: `<NN>-stable` on a release branch, `master` otherwise.

### Plans callouts

A blockquote that starts with `> **Plans:**` is styled as a plans callout:

```markdown
> **Plans:** Available on Pro and Enterprise plans.
```

## Auto-generated docs

Don't edit these files by hand — your changes will be overwritten the next time the generator runs. `docs/api.json` is gitignored and regenerated lazily from `defendpoint` docstrings under `src/metabase/**/api/`; the rest are committed alongside the code change that motivates the regeneration.

| Flag          | Output                                                          |
| ------------- | --------------------------------------------------------------- |
| `--env-vars`  | `docs/configuring-metabase/environment-variables.md`            |
| `--config`    | `docs/configuring-metabase/config-template.md`                  |
| `--api`       | `docs/api.json` (gitignored)                                    |
| `--commands`  | `docs/installation-and-operation/commands.md`                   |
| `--analytics` | `docs/usage-and-performance-tools/usage-analytics-reference.md` |

```
./bin/mage docs-generate --env-vars       # one slice
bun run docs:generate                     # regenerate everything
```

The embedding SDK and Embed.js reference is typedoc-generated:

```
./bin/mage docs-generate-embedding         # full SDK rebuild + typedoc
./bin/mage docs-generate-embedding --pure  # typedoc only (when SDK d.ts is current)
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

## Page chrome, search, and feedback widget

The header, footer, and Inkeep search bar are native to the docs site — the build has no dependency on anything hosted on metabase.com. Header and footer markup lives under [`docs-build/src/data/`](../../docs-build/src/data/) and is raw-imported by the Astro components; styles are in [`docs-build/src/styles/chrome.css`](../../docs-build/src/styles/chrome.css). The "Was this helpful?" feedback widget renders into the right-hand rail and POSTs to the CRM endpoint. If you need to touch any of this, see the `docs-build` skill in [`.claude/skills/docs-build/SKILL.md`](../../.claude/skills/docs-build/SKILL.md); the comment block at the top of `chrome.css` lists the class names that docs.css overrides depend on.

## Style

Docs are conversational and write to the reader in the second person ("you"). Keep paragraphs short, prefer concrete examples over abstractions, and link liberally to related pages rather than repeating their content.

For broader contribution guidance, see [CONTRIBUTING.md](../../CONTRIBUTING.md).
