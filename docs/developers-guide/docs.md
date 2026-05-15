---
title: Developing Metabase documentation
---

# Developing Metabase documentation

The markdown lives in [`docs/`](../). The site is a self-contained [Astro](https://astro.build/) app under [`docs-build/`](../../docs-build) that renders each markdown file as a page. Builds are orchestrated by `./bin/mage docs-*` tasks; the `bun run docs:*` aliases in the root [`package.json`](../../package.json) shell out to them. Run `./bin/mage <task> --help` for options.

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

| Task                                | Purpose                                   | Bun alias                         |
| ----------------------------------- | ----------------------------------------- | --------------------------------- |
| `docs-build`                        | Full production build                     | `bun run docs:build`              |
| `docs-build --preview --lazy`       | Lazy-regen build + preview server         | `bun run docs:preview`            |
| `docs-build-branch <branch>`        | Build any release branch via a worktree   | —                                 |
| `docs-generate`                     | Regenerate auto-derived backend docs      | `bun run docs:generate`           |
| `docs-generate-embedding`           | Regenerate SDK/Embed.js typedoc reference | `bun run docs:generate:embedding` |

Implementations live in [`mage/src/mage/docs.clj`](../../mage/src/mage/docs.clj). `docs-build-branch release-x.55.x` builds the v0.55 docs into `build/docs/v0.55/` via a git worktree at `__worktrees/docs-<branch>/` — kept on failure for debugging, cleaned up on success (or via `./bin/mage docs-clean-worktrees --force`).

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

`{{ dirname }}` resolves to the consuming file's directory. Markdown is spliced in; source files (`.ts`, `.tsx`, `.py`, …) render as syntax-highlighted code blocks. Snippet markers: `<!-- [<snippet NAME>] -->` … `<!-- [<endsnippet NAME>] -->` for markdown, `// [<snippet NAME>]` … `// [<endsnippet NAME>]` for source. This keeps the SDK docs in sync with real, type-checked `.tsx` files under `docs/embedding/sdk/snippets/`.

### Plans callouts

A blockquote that starts with `> **Plans:**` renders as a plans callout:

```markdown
> **Plans:** Available on Pro and Enterprise plans.
```

### `{SAMPLE_APP_BRANCH}`

Replaced at build time with the SDK sample-app branch (`<NN>-stable` on a release branch, `master` otherwise).

## Auto-generated docs

Don't edit these by hand — your changes will be overwritten next time the generator runs. `docs/api.json` is gitignored and regenerated lazily from `defendpoint` docstrings under `src/metabase/**/api/`; the rest are committed alongside the code change that motivates the regeneration.

| Flag               | Output                                                          |
| ------------------ | --------------------------------------------------------------- |
| `--env-vars`       | `docs/configuring-metabase/environment-variables.md`            |
| `--config`         | `docs/configuring-metabase/config-template.md`                  |
| `--api`            | `docs/api.json` (gitignored)                                    |
| `--commands`       | `docs/installation-and-operation/commands.md`                   |
| `--analytics`      | `docs/usage-and-performance-tools/usage-analytics-reference.md` |
| `--country-codes`  | `docs/questions/visualizations/country-codes.md`                |

```
./bin/mage docs-generate --env-vars       # one slice
bun run docs:generate                     # regenerate everything
```

The embedding SDK and Embed.js reference is typedoc-generated — `bun run docs:generate:embedding` (or `--pure` to skip the SDK rebuild). Commit the diffs under `docs/embedding/sdk/api/` and `docs/embedding/eajs/snippets/`.

## Lint and check

Before opening a PR:

- `bun run docs:check` — Astro/TypeScript check (frontmatter, plugin errors, broken includes, nav.yml typos).
- `bun run docs:test` — unit tests for the remark plugins.
- `bun run lint-docs-links` — verify in-product `docsUrl()` references point at real markdown files.

## Style

Docs are conversational and write to the reader in the second person ("you"). Keep paragraphs short, prefer concrete examples over abstractions, and link liberally to related pages rather than repeating their content.

For broader contribution guidance, see [CONTRIBUTING.md](../../CONTRIBUTING.md). For the build internals (page chrome, custom plugins, generator wiring), see the `docs-build` skill at [`.claude/skills/docs-build/SKILL.md`](../../.claude/skills/docs-build/SKILL.md).
