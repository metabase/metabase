import { screen, waitFor } from "@testing-library/react";

import { type SetupOpts, setup as baseSetup } from "./setup";

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

    // TODO: This needs to be improved because it would pass even if the text were translated
    await waitFor(() => {
      expect(screen.getByTestId("legend-caption-title")).toHaveTextContent(
        "Hello World",
      );
    });
  });
});
