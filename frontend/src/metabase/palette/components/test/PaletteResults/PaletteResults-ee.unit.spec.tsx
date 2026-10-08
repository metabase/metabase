import { screen, within } from "__support__/ui";

import { type CommonSetupProps, commonSetup } from "./setup";

// The search debounce is idle time in these tests: they assert what a search
// returns, not that the input waits before it asks.
jest.mock("metabase/utils/constants", () => ({
  ...jest.requireActual("metabase/utils/constants"),
  SEARCH_DEBOUNCE_DURATION: 0,
}));

const setup = (props: CommonSetupProps = {}) => {
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
  });
});
