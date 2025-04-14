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
    const frontmatterGlobals = app.options.getValue("frontmatterGlobals");
    const yamlItems = Object.entries(frontmatterGlobals)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");

    page.contents = `---\n${yamlItems}\n---\n\n${page.contents}`;
  });
}
