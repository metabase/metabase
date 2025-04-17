import { screen, waitFor } from "@testing-library/react";

import { setupTranslateContentStringSpy } from "__support__/server-mocks/content-translation";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (opts: SetupOpts) =>
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { content_translation: false },
    ...opts,
  });

describe("LegendCaption (EE without token)", () => {
  const getContentTranslatorSpy = setupTranslateContentStringSpy();

  it("should not try to translate any content", async () => {
    setup({
      title: "Hello World",
      locale: "es",
    });

    await waitFor(() => {
      expect(screen.getByTestId("legend-caption-title")).toHaveTextContent(
        "Hello World",
      );
    });

    expect(getContentTranslatorSpy()).not.toHaveBeenCalled();
  });
});
