import { Renderer } from "typedoc";

/**
 * For some reason typedoc updates data-refl value having the same visual output
 * This data attribute is used for full hierarchy page, but we don't use it, it is disabled, so we can safely remove the attribute
 *
 * TODO: figure out if there a better way to avoid this attribute
 */
export function load(app) {
  app.renderer.on(Renderer.EVENT_END_PAGE, (page) => {
    if (page.contents) {
      page.contents = page.contents.replace(/ data-refl="[^"]*"/g, "");
    }
  });
}
