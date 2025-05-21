import fetchMock from "fetch-mock";

import { screen, within } from "__support__/ui";

import { type CommonSetupProps, commonSetup } from "./setup";

const setup = (props: CommonSetupProps = {}) => {
  fetchMock.get("path:/api/ee/metabot-v3/v2/prompt-suggestions", {
    prompts: [],
  });

  commonSetup({ ...props, isEE: true });
};

describe("PaletteResults EE", () => {
  describe("content verification", () => {
    it("should show verified badges for recents", async () => {
      setup();
      //Foo Question should be displayed with a verified badge
      expect(
        await within(
          await screen.findByRole("option", { name: "Foo Question" }),
        ).findByRole("img", { name: /verified_filled/ }),
      ).toBeInTheDocument();
    });

    it("should show verified badges for search results", async () => {
      setup({ query: "ques" });

      //Foo Question should be displayed with a verified badge
      expect(
        await within(
          await screen.findByRole("option", { name: "Foo Question" }),
        ).findByRole("img", { name: /verified_filled/ }),
      ).toBeInTheDocument();
    });

    it("should show the default metabot palette item", async () => {
      setup();
      expect(
        await screen.findByRole("option", {
          name: "Ask me to do something, or ask me a question",
        }),
      ).toBeInTheDocument();
    });

    it("should show the metabot palette item with interpolated query", async () => {
      setup({ query: "what is our aov" });
      expect(
        await screen.findByRole("option", {
          name: 'Ask Metabot, "what is our aov"',
        }),
      ).toBeInTheDocument();
    });
  });
});
