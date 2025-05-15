import { screen, waitFor } from "@testing-library/react";

import { setup as baseSetup, sampleSpanishDictionary } from "./setup";

const setup = (opts: SetupOpts) =>
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { content_translation: false },
    ...opts,
  });

describe("LegendCaption (EE without token)", () => {
  it("should not translate title", async () => {
    setup({
      title: "Hello World",
      locale: "es",
    });

    await waitFor(() => {
      expect(screen.getByTestId("legend-caption-title")).toHaveTextContent(
        "Hello World",
      );
    });
  });
});
