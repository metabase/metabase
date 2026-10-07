---
title: Developing Metabase documentation
---

# Developing Metabase documentation

Notes on writing docs for Metabase.

## Linting markdown links

You can check for broken links in the [docs](../) directory by running:

```
bun run docs-lint-links
```

This command uses [Markdown link check](https://github.com/tcort/markdown-link-check) to vet links in all of the markdown files in the [docs](../) directory. We recommend writing the command's output to a file. E.g.,

```
touch ~/links-to-fix.txt && bun run docs-lint-links > ~/links-to-fix.txt
```

Alternatively, if you just want to check the in-product links to make sure they link to actual documents:

```
bun run lint-docs-links
```

You can view both commands in the [package.json](https://github.com/metabase/metabase/blob/master/package.json) file under `scripts`.

## Regenerate docs built from source

Some docs pages are generated from the source code. A scheduled GitHub workflow regenerates them every weekday and opens a PR with any changes.

To regenerate them yourself, first install the [prerequisites for building Metabase](./build.md#install-the-prerequisites): Java, the Clojure CLI, Node.js, and Bun. You don't need to install Babashka, since `./bin/mage` installs it for you. Then install the frontend dependencies:

```
bun install
```

Then run:

```
./bin/mage generate-docs
```

To regenerate one group of pages, pass its suite name. For example:

```
./bin/mage generate-docs backend
```

| Suite             | What it regenerates                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `backend`         | Environment variables, the config template, the API, AI providers, MCP tools, and CLI commands |
| `usage-analytics` | The usage analytics reference                                                                  |
| `embedding-sdk`   | The embedding SDK API reference. It builds the SDK package first, so it's the slowest.         |
| `embedding-eajs`  | The modular embedding (EAJS) reference                                                         |

The `backend` suite runs all of its generators in one JVM, so it's faster than running each `clojure -M:ee:doc` command separately. It also runs at the same time as the other suites, so their output is mixed together. If any suite fails, the last line of output lists it.

## Updating API docs

To update an API endpoint description, you'll need to edit the comment in the [source code for that endpoint](https://github.com/metabase/metabase/tree/master/src/metabase/api).

To bring your changes into `docs/latest/api-documentation`, you'll need to open a separate PR. Check out a new branch from the current release branch, and run:

```
clojure -M:ee:doc api-documentation
```

## Style guide

Ancient [style guide](<https://github.com/metabase/metabase/wiki/Writing-style-guide-for-documentation-and-blog-posts-(WIP)>) that needs an update.
