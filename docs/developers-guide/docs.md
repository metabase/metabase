---
title: Developing Metabase documentation
summary: Preview docs as you write them, check for broken links, and regenerate the pages that are built from source.
---

# Developing Metabase documentation

## Linting markdown links

To check the links in the [docs](../) directory, in the nav, and in the source code, run:

```sh
docs/util/check-links.sh
```

The script needs [lychee](https://lychee.cli.rs) and `jq`. To check only the in-product links (the pages passed to `useDocsUrl` and `getDocsUrl`), run:

```sh
bun run lint-docs-links
```

CI runs both checks.

## Preview docs as you write them

You'll need [Bun](https://bun.sh) and a checkout of the private `metabase-dot-com` repo at `~/metabase-dot-com`. Then run:

```
./bin/mage docs-preview
```

Your browser opens `http://localhost:4000/docs/latest/`, and your edits show up as you save them. Only `/docs/latest/` pages work.

To preview a worktree or another checkout, pass its path. If `metabase-dot-com` is somewhere else, pass `--site DIR` or set `METABASE_DOT_COM_DIR`.

## Regenerate docs built from source

Some docs pages are generated from the source code. A scheduled GitHub workflow regenerates them every weekday and opens a PR with any changes.

To regenerate them yourself, first install the [prerequisites for building Metabase](./build.md#install-the-prerequisites): Java, the Clojure CLI, Node.js, and Bun. You don't need to install Babashka, since `./bin/mage` installs it for you. Then install the frontend dependencies:

```
bun install
```

Then run:

```
./bin/mage docs-generate
```

To regenerate one group of pages, pass its suite name. For example:

```
./bin/mage docs-generate backend
```

To list the suites, run `./bin/mage docs-generate -h`. If any suite fails, the last line of output lists it.

## Updating API docs

To update an API endpoint description, you'll need to edit the comment in the [source code for that endpoint](https://github.com/metabase/metabase/tree/master/src/metabase/api).

To bring your changes into `docs/latest/api-documentation`, you'll need to open a separate PR. Check out a new branch from the current release branch, and run:

```
clojure -M:ee:doc api-documentation
```

## Style guide

Follow the [Metabase writing style guide](https://github.com/metabase/metabase/blob/master/.claude/skills/_shared/metabase-style-guide.md), and the [`docs-write` skill](https://github.com/metabase/metabase/blob/master/.claude/skills/docs-write/SKILL.md) for the rules that only the docs need.
