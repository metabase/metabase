import { screen, waitFor } from "@testing-library/react";

import { setupTranslateContentStringSpy } from "__support__/content-translation";

import { setup } from "./setup";

describe("LegendCaption (OSS)", () => {
  describe("content translation", () => {
    const getContentTranslatorSpy = setupTranslateContentStringSpy();

    it("should not attempt to translate any content", async () => {
      setup({
        title: "Hello World",
        localeCode: "es",
      });

      await waitFor(() => {
        expect(screen.getByTestId("legend-caption-title")).toHaveTextContent(
          "Hello World",
        );
      });

      expect(getContentTranslatorSpy()).not.toHaveBeenCalled();
    });
  });
});
