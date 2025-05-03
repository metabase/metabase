import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";

import { dictionaryWithGermanPhrases } from "./constants";
import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  return baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { content_translation: true },
    ...opts,
  });
}

describe("TitleAndDescription Component (EE with token feature)", () => {
  describe("when German dictionary is provided", () => {
    const dictionary = dictionaryWithGermanPhrases;

    it("displays untranslated question title and description when locale is English", async () => {
      setup({ localeCode: "en", dictionary });

      await waitFor(() => {
        expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
          "Sample text",
        );
      });

      await userEvent.hover(screen.getByLabelText("info icon"));
      expect(
        await screen.findByRole("tooltip", {
          name: "Sample description",
        }),
      ).toBeInTheDocument();
    });

    it("displays translated question title and description when locale is German", async () => {
      setup({ localeCode: "de", dictionary });

      await waitFor(() => {
        expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
          "Beispieltext",
        );
      });

      await userEvent.hover(screen.getByLabelText("info icon"));
      expect(
        await screen.findByRole("tooltip", {
          name: "Beispielbeschreibung",
        }),
      ).toBeInTheDocument();
    });
  });
});
