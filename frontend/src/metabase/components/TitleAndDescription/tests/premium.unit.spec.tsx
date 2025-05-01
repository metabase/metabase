import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { sampleDictionary } from "./constants";
import { type SetupOpts, setup as baseSetup } from "./utils";

describe("TitleAndDescription component", () => {
  describe("EE with token", () => {
    const setup = (opts: SetupOpts) =>
      baseSetup({
        hasEnterprisePlugins: true,
        tokenFeatures: { content_translation: true },
        ...opts,
      });

    describe("when a German content translation dictionary is provided", () => {
      it(`displays translated question title and description when locale is de`, async () => {
        setup({ localeCode: "de", dictionary: sampleDictionary });
        expect(
          await screen.findByRole("heading", {
            name: "Beispieltext",
          }),
        ).toBeInTheDocument();

        await userEvent.hover(screen.getByLabelText("info icon"));
        expect(
          await screen.findByRole("tooltip", {
            name: "Beispielbeschreibung",
          }),
        ).toBeInTheDocument();
      });
    });
  });
});
