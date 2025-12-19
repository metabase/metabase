---
title: Developing Metabase documentation
---

# Developing Metabase documentation

Notes on writing docs for Metabase.

## Linting markdown links

You can check for broken links in the [docs](../) directory by running:

```
yarn run docs-lint-links
```

This command uses [Markdown link check](https://github.com/tcort/markdown-link-check) to vet links in all of the markdown files in the [docs](../) directory. We recommend writing the command's output to a file. E.links.,

```
touch ~/links-to-fix.txt && yarn run docs-lint-links > ~/links-to-fix.txt
```

Alternatively, if you just want to check the in-product links to make sure they link to actual documents:

```
yarn run lint-docs-links
```

You can view both commands in the [package.json](https://github.com/metabase/metabase/blob/master/package.json) file under `scripts`.

## Updating API docs

To update an API endpoint description, you'll need to edit the comment in the [source code for that endpoint](https://github.com/metabase/metabase/tree/master/src/metabase/api).

To bring your changes into `docs/latest/api-documentation`, you'll need to open a separate PR. Check out a new branch from the current release branch, and run:

```
clojure -M:ee:run api-documentation
```

## Style guide

Ancient [style guide](<https://github.com/metabase/metabase/wiki/Writing-style-guide-for-documentation-and-blog-posts-(WIP)>) that needs an update.
