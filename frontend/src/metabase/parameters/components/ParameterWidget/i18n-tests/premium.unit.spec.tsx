import { setupTranslateContentStringSpy } from "__support__/content-translation";
import { screen, waitFor } from "__support__/ui";

import { setup } from "./setup.spec";

describe("ParameterWidget (EE with token, in static embedding)", () => {
  describe("content translation", () => {
    const translateContentStringSpy = setupTranslateContentStringSpy();

    it("should translate legend", async () => {
      setup({
        enterprisePlugins: ["content_translation"],
        tokenFeatures: { content_translation: true },
        staticallyEmbedded: true,
        localeCode: "de",
        dictionary: [
          {
            msgid: "Text contains",
            msgstr: "Text enthält",
            locale: "de",
          },
        ],
      });
      await waitFor(() => {
        expect(
          screen.getByTestId("parameter-value-widget-target"),
        ).toHaveTextContent("Text enthält");
      });
      expect(translateContentStringSpy()).toHaveBeenCalled();
    });
  });
});
