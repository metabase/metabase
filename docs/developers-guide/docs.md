# Developing Metabase documentation

Notes on writing docs for Metabase.

## Linting markdown links

You can check for broken links in the [docs](../) directory by running:

```
yarn run docs-lint-links
```

This commands uses [Markdown link check](https://github.com/tcort/markdown-link-check) to vet links in all of the markdown files in the [docs](../) directory. We recommend writing the command's output to a file. E.links.,

```
touch ~/links-to-fix.txt && yarn run docs-lint-links > ~/links-to-fix.txt
```

Alternatively, if you just want to check the in-product links to make sure they link to actual documents:

```
yarn run lint-docs-links
```

You can view both commands in the [package.json](https://github.com/metabase/metabase/blob/master/package.json) file under `scripts`.

## Style guide

Ancient [style guide](https://github.com/metabase/metabase/wiki/Writing-style-guide-for-documentation-and-blog-posts-(WIP)) that needs an update.


