# Release list

Builds a page that lists all Metabase releases for docs: `docs/releases.md`.

## Requirements

This script requires:

- [Babashka](https://github.com/babashka/babashka)
- [GitHub's CLI (gh)](https://cli.github.com)

## Generate the list of releases

From this directory, run:

```
bb -m release-list.main
```

## Run tests

From this directory, run:

```
bb test:bb
```


## Editing the page

Edit the template: [./resources/releases-template.md](./resources/releases-template.md).
