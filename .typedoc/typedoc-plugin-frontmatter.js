import { ParameterType, PageEvent } from "typedoc";

/**
 * Adds frontmatter globals to each page.
 */
export function load(app) {
  app.options.addDeclaration({
    name: "frontmatterGlobals",
    help: "Frontmatter globals to be added to each page.",
    type: ParameterType.Object,
    defaultValue: {},
  });

  app.renderer.on(PageEvent.END, (page) => {
    const isHtmlPage = page.url.endsWith(".html");

    if (!isHtmlPage) {
      return;
    }

    const frontmatterGlobals = app.options.getValue("frontmatterGlobals");

    const model = page.model;

    frontmatterGlobals.title = model.name || frontmatterGlobals.title;

    const yamlItems = Object.entries(frontmatterGlobals)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");

    // Generate a redirect_from for the parallel `embedding/api/<Name>` path.
    // Snippets in `sdk/api/snippets/*.md` link with relative `./api/X.md`; when
    // included into a doc outside `sdk/` (e.g. `embedding/parameters.md`),
    // that resolves to `embedding/api/X` instead of `embedding/sdk/api/X`.
    // The redirect makes those URLs resolve via 301 instead of 404'ing.
    const pageName = page.url.replace(/\.html$/, "");
    const redirectBlock =
      pageName && pageName !== "index"
        ? `\nredirect_from:\n  - /docs/latest/embedding/api/${pageName}`
        : "";

    page.contents = `---\n${yamlItems}${redirectBlock}\n---\n\n${page.contents}`;
  });
}
