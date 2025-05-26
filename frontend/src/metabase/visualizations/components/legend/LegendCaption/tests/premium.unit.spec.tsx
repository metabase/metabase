import { screen, waitFor } from "@testing-library/react";

import { setup, sampleSpanishDictionary } from "./setup";

describe("LegendCaption (EE with token)", () => {
  it("should translate title when content_translation is enabled and enterprise plugins are available", async () => {
    setup({
      title: "Hello World",
      locale: "es",
      translations: sampleSpanishDictionary,
      enterprisePlugins: true,
      tokenFeatures: { content_translation: true },
    });

    await waitFor(() => {
      expect(screen.getByTestId("legend-caption-title")).toHaveTextContent(
        "Hola Mundo",
      );
    });
  });

  it("should not translate title when translation is an empty string", async () => {
    setup({
      title: "Hello World",
      locale: "es",
      translations: [
        {
          id: 1,
          locale: "es",
          msgid: "Hello World",
          msgstr: "",
        },
      ],
      enterprisePlugins: true,
      tokenFeatures: { content_translation: true },
    });

    await waitFor(() => {
      expect(screen.getByTestId("legend-caption-title")).toHaveTextContent(
        "Hello World",
      );
    });
  });

  it("should not translate title when no dictionary is available", async () => {
    setup({
      title: "Hello World",
      locale: "es",
      enterprisePlugins: true,
      tokenFeatures: { content_translation: true },
    });

    await waitFor(() => {
      expect(screen.getByTestId("legend-caption-title")).toHaveTextContent(
        "Hello World",
      );
    });
  });
});
