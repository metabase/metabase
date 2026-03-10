import userEvent from "@testing-library/user-event";

import { setupTranslateContentStringSpy } from "__support__/content-translation";
import { screen } from "__support__/ui";

import { setup } from "./utils.spec";

describe("TitleAndDescription component", () => {
  describe("EE with content translation token and static embedding", () => {
    const getTranslateContentString = setupTranslateContentStringSpy();

    it("displays translated question title and description", async () => {
      setup({
        enterprisePlugins: ["content_translation"],
        tokenFeatures: { content_translation: true },
        staticallyEmbedded: true,
        dictionary: [
          {
            msgid: "Sample Heading",
            msgstr: "Translated Heading",
            locale: "en",
          },
          {
            msgid: "Sample Description",
            msgstr: "Translated Description",
            locale: "en",
          },
        ],
      });
      expect(
        await screen.findByRole("heading", {
          name: "Translated Heading",
        }),
      ).toBeInTheDocument();

      await userEvent.hover(screen.getByLabelText("info icon"));
      expect(
        await screen.findByRole("tooltip", {
          name: "Translated Description",
        }),
      ).toBeInTheDocument();
      expect(getTranslateContentString()).toHaveBeenCalled();
    });
  });
});
