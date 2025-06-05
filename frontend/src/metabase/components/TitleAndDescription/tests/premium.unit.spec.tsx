import userEvent from "@testing-library/user-event";

import { setupTranslateContentStringSpy } from "__support__/content-translation";
import { screen } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./utils";

describe("TitleAndDescription component", () => {
  describe("EE with token", () => {
    const setup = (opts?: SetupOpts) =>
      baseSetup({
        hasEnterprisePlugins: true,
        tokenFeatures: { content_translation: true },
        ...opts,
      });

    const getContentTranslatorSpy = setupTranslateContentStringSpy();

    it("displays translated question title and description", async () => {
      setup();
      expect(
        await screen.findByRole("heading", {
          name: "mock translation of Sample Heading",
        }),
      ).toBeInTheDocument();

      await userEvent.hover(screen.getByLabelText("info icon"));
      expect(
        await screen.findByRole("tooltip", {
          name: "mock translation of Sample Description",
        }),
      ).toBeInTheDocument();
      expect(getContentTranslatorSpy()).toHaveBeenCalled();
    });
  });
});
