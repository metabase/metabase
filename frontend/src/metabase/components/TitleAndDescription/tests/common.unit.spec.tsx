import userEvent from "@testing-library/user-event";

import { setupTranslateContentStringSpy } from "__support__/server-mocks/content-translation";
import { screen } from "__support__/ui";

import { sampleDictionary } from "./constants";
import { type SetupOpts, setup as baseSetup } from "./utils";

describe("TitleAndDescription component (OSS)", () => {
  const setup = (opts: SetupOpts) =>
    baseSetup({ hasEnterprisePlugins: false, ...opts });

  const getContentTranslatorSpy = setupTranslateContentStringSpy();

  describe("when a German content translation dictionary is provided", () => {
    ["en", "de"].forEach((locale) => {
      it(`displays untranslated question title and description when locale is ${locale}`, async () => {
        setup({ localeCode: "en", dictionary: sampleDictionary });
        expect(
          await screen.findByRole("heading", {
            name: "Sample text",
          }),
        ).toBeInTheDocument();

        await userEvent.hover(screen.getByLabelText("info icon"));
        expect(
          await screen.findByRole("tooltip", {
            name: "Sample description",
          }),
        ).toBeInTheDocument();

        expect(getContentTranslatorSpy()).not.toHaveBeenCalled();
      });
    });
  });
});
