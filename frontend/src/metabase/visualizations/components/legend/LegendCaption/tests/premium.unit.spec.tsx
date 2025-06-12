import { screen, waitFor } from "@testing-library/react";

import { setupTranslateContentStringSpy } from "__support__/content-translation";

import { setup } from "./setup";

describe("LegendCaption (EE with token)", () => {
  const getContentTranslatorSpy = setupTranslateContentStringSpy();

  it("should translate caption title", async () => {
    setup({
      title: "Hello World",
      locale: "es",
      hasEnterprisePlugins: true,
      tokenFeatures: { content_translation: true },
    });

    await waitFor(() => {
      expect(screen.getByTestId("legend-caption-title")).toHaveTextContent(
        "mock translation of Hello World",
      );
    });

    expect(getContentTranslatorSpy()).toHaveBeenCalled();
  });
});
