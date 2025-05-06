import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { dictionaryWithGermanPhrases as dictionary } from "./constants";
import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  return baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { content_translation: false },
    ...opts,
  });
}

describe("TitleAndDescription Component (EE without token feature)", () => {
  describe("when a German content translation dictionary is provided", () => {
    it("displays untranslated question title and description when locale is English", async () => {
      setup({ localeCode: "en", dictionary });

      expect(
        await screen.findByRole("heading", {
          name: dictionary[0].msgid,
          level: 2,
        }),
      ).toBeInTheDocument();

      await userEvent.hover(screen.getByLabelText("info icon"));
      expect(
        await screen.findByRole("tooltip", {
          name: dictionary[1].msgid,
        }),
      ).toBeInTheDocument();
    });

    it("displays untranslated question title and description when locale is German", async () => {
      setup({ localeCode: "de", dictionary });

      expect(
        await screen.findByRole("heading", {
          name: dictionary[0].msgid,
          level: 2,
        }),
      ).toBeInTheDocument();

      await userEvent.hover(screen.getByLabelText("info icon"));
      expect(
        await screen.findByRole("tooltip", {
          name: dictionary[1].msgid,
        }),
      ).toBeInTheDocument();
    });
  });
});
