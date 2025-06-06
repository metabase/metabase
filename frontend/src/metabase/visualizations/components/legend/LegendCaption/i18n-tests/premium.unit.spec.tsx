import { screen, waitFor } from "@testing-library/react";

import { setupTranslateContentStringSpy } from "__support__/content-translation";

import { setup } from "./setup";

describe("LegendCaption (EE with token, in static embedding)", () => {
  describe("content translation", () => {
    const getContentTranslatorSpy = setupTranslateContentStringSpy();

    it("should translate caption title", async () => {
      setup({
        title: "Hello World",
        localeCode: "es",
        hasEnterprisePlugins: true,
        tokenFeatures: { content_translation: true },
        staticallyEmbedded: true,
        dictionary: [
          {
            msgid: "Hello World",
            msgstr: "Hola Mundo",
            locale: "es",
          },
        ],
      });

      await waitFor(() => {
        expect(screen.getByTestId("legend-caption-title")).toHaveTextContent(
          "Hola Mundo",
        );
      });

      expect(getContentTranslatorSpy()).toHaveBeenCalled();
    });
  });
});
