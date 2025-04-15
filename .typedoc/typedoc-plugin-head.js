import { Renderer } from "typedoc";

export function load(app) {
  app.renderer.on(Renderer.EVENT_END_PAGE, (page) => {
    if (page.contents) {
      page.contents = page.contents.replace(
        /<meta\s+name="description"[^>]*>/,
        "{% include docs/embedded-analytics-sdk-metadata.html %}",
      );
    }
  });
}
