import userEvent from "@testing-library/user-event";

import { setupTranslateContentStringSpy } from "__support__/server-mocks/content-translation";
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

    const getContentTranslatorSpy = setupTranslateContentStringSpy();

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
        expect(getContentTranslatorSpy()).toHaveBeenCalled();
      });

      it(`displays untranslated question title and description when locale is fr`, async () => {
        setup({ localeCode: "fr", dictionary: sampleDictionary });
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
        expect(getContentTranslatorSpy()).toHaveBeenCalled();
      });
    });
  });
});
