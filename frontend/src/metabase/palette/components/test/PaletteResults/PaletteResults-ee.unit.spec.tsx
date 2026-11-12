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
  describe("official content", () => {
    it("should show official badges for recents in official collection", async () => {
      setup();
      expect(
        await within(
          await screen.findByRole("option", { name: "Bar Dashboard" }),
        ).findByTestId("official-badge"),
      ).toBeInTheDocument();
      expect(
        within(
          await screen.findByRole("option", { name: "Foo Question" }),
        ).queryByTestId("official-badge"),
      ).not.toBeInTheDocument();
    });

    it("should show official badges for search results in official collection", async () => {
      setup({ query: "ques" });

      expect(
        await within(
          await screen.findByRole("option", { name: "Bar Question" }),
        ).findByTestId("official-badge"),
      ).toBeInTheDocument();
      expect(
        within(
          await screen.findByRole("option", { name: "Foo Question" }),
        ).queryByTestId("official-badge"),
      ).not.toBeInTheDocument();
    });
  });
});
