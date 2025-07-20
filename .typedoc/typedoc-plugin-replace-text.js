import { ParameterType, Renderer } from "typedoc";

export function load(app) {
  app.options.addDeclaration({
    name: "replaceText",
    help: "Text replacements",
    type: ParameterType.Object,
    defaultValue: {},
  });

  app.renderer.on(Renderer.EVENT_END_PAGE, (page) => {
    const textReplacements = app.options.getValue("replaceText");

    if (page.contents) {
      page.contents = Object.entries(textReplacements).reduce(
        (contents, [search, replace]) =>
          contents.replace(new RegExp(search, "g"), replace),
        page.contents,
      );
    }
  });
}
