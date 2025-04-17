import { screen, waitFor } from "@testing-library/react";

import { setupTranslateContentStringSpy } from "__support__/server-mocks/content-translation";

import { setup } from "./setup";

describe("LegendCaption (OSS)", () => {
  const getContentTranslatorSpy = setupTranslateContentStringSpy();

  it("should not attempt to translate any content", async () => {
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
