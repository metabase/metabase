import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { assertNeverPasses } from "__support__/utils";

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
      it(`displays untranslated question title and description when locale is en`, async () => {
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

        await assertNeverPasses(async () => {
          expect(
            await screen.findByRole("heading", {
              name: "Beispieltext",
            }),
          ).toBeInTheDocument();
        });

        await assertNeverPasses(async () => {
          await userEvent.hover(screen.getByLabelText("info icon"));
          expect(
            await screen.findByRole("tooltip", {
              name: "Beispielbeschreibung",
            }),
          ).toBeInTheDocument();
        });
      });

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
