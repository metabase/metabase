# Add, move, or rename a page, or change headings and links

## Give a new page front matter and a nav entry

Every page has `title` and `summary` front matter, and an entry in `docs/util/data/nav.yml`. Some pages stay out of the nav on purpose. When you're done, run `bunx prettier --write` on the page.

## If you rewrite a heading, fix the links to it

Product code links to docs anchors too. Before you change `## Cache configuration`, search for the anchor it generates, without the `#`:

```sh
grep -rn "cache-configuration" docs/ frontend/src enterprise/frontend/src src enterprise/backend/src modules resources
```

CI checks links and anchors, but it skips links that the code builds from variables, so search even if CI passes.

## Redirect a moved or replaced page, and fix links to it

- **List the old path in `redirect_from`** on the page that moved, or that replaces another page, along with the old page's own entries:

  ```yaml
  redirect_from:
    - /docs/latest/old-section/old-page
  ```

- **Update the links to the old page.** Search for the old page name:

  ```sh
  grep -rn "old-page" docs/ frontend/src enterprise/frontend/src src enterprise/backend/src modules resources
  ```

## Check the links you changed

If you changed a link, a heading, or a page's path, run:

```sh
docs/util/check-links.sh
bun run lint-docs-links
```

The first command checks links in `docs/`, in the nav, and in the source code. It needs [lychee](https://lychee.cli.rs) and `jq`. The second command checks `useDocsUrl` and `getDocsUrl` calls in the frontend, and installs the frontend dependencies first. CI runs both checks too.

## Change generated pages at their source

Scripts generate the following pages from source, most of them every weeknight. To change one of these pages, change its source.

- `docs/configuring-metabase/environment-variables.md` and `config-template.md`
- `docs/installation-and-operation/commands.md`
- `docs/api.html`
- `docs/ai/providers.md` and `docs/ai/mcp-tools.md`
- `docs/usage-and-performance-tools/usage-analytics-reference.md`
- `docs/questions/visualizations/country-codes.md`
- `docs/databases/feature-support.md`
- `docs/exploration-and-organization/keyboard-shortcuts.md`
- `docs/embedding/sdk/api/` and `docs/embedding/eajs/snippets/`

A script also updates the Docker tags in `docs/installation-and-operation/running-metabase-on-docker.md` and `upgrading-metabase.md`. Leave those tags alone.

People write the code in `docs/embedding/snippets/` and `docs/embedding/sdk/snippets/`, which pages pull in with `include_file`. Edit and review those files like any other code example.
