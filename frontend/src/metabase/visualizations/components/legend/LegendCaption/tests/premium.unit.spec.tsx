import { screen, waitFor } from "@testing-library/react";

import { setupTranslateContentStringSpy } from "__support__/server-mocks/content-translation";

import { sampleSpanishDictionary, setup } from "./setup";

describe("LegendCaption (EE with token)", () => {
  const getContentTranslatorSpy = setupTranslateContentStringSpy();

  it("should translate caption title", async () => {
    setup({
      title: "Hello World",
      locale: "es",
      translations: sampleSpanishDictionary,
      hasEnterprisePlugins: true,
      tokenFeatures: { content_translation: true },
    });

    await waitFor(() => {
      expect(screen.getByTestId("legend-caption-title")).toHaveTextContent(
        "Hola Mundo",
      );
    });

    expect(getContentTranslatorSpy()).toHaveBeenCalled();
  });
});
