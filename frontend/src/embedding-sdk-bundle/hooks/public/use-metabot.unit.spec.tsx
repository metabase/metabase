import { assocIn } from "icepick";

import { act, screen, waitFor } from "__support__/ui";
import { metabotActions } from "metabase/metabot/state";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import { setup } from "metabase/metabot/tests/utils";

import { useMetabot } from "./use-metabot";

jest.mock("embedding-sdk-bundle/components/public/StaticQuestion", () => ({
  StaticQuestion: ({ query }: { query?: string }) => (
    <div data-testid="mock-static-question" data-query={query} />
  ),
}));

jest.mock("embedding-sdk-bundle/components/public/InteractiveQuestion", () => ({
  InteractiveQuestion: ({ query }: { query?: string }) => (
    <div data-testid="mock-interactive-question" data-query={query} />
  ),
}));

const makeVisibleState = () =>
  assocIn(
    getMetabotInitialState(),
    ["conversations", "omnibot", "visible"],
    true,
  );

const TestCurrentChart = ({ drills }: { drills?: true }) => {
  const { currentChart: Chart } = useMetabot();
  if (!Chart) {
    return <div data-testid="no-chart" />;
  }
  return <Chart drills={drills} />;
};

describe("useMetabot", () => {
  describe("currentChart", () => {
    it("is null before navigate_to fires", () => {
      setup({
        ui: <TestCurrentChart />,
        metabotInitialState: makeVisibleState(),
      });

      expect(screen.getByTestId("no-chart")).toBeInTheDocument();
    });

    it("becomes a component after navigate_to fires", async () => {
      const { store } = setup({
        ui: <TestCurrentChart />,
        metabotInitialState: makeVisibleState(),
      });

      expect(screen.getByTestId("no-chart")).toBeInTheDocument();

      act(() => {
        store.dispatch(metabotActions.setNavigateToPath("/question#abc"));
      });

      await waitFor(() => {
        expect(screen.queryByTestId("no-chart")).not.toBeInTheDocument();
      });
    });

    it("renders StaticQuestion when drills is absent", async () => {
      const { store } = setup({
        ui: <TestCurrentChart />,
        metabotInitialState: makeVisibleState(),
      });

      act(() => {
        store.dispatch(metabotActions.setNavigateToPath("/question#abc"));
      });

      expect(
        await screen.findByTestId("mock-static-question"),
      ).toBeInTheDocument();
    });

    it("renders InteractiveQuestion when drills is true", async () => {
      const { store } = setup({
        ui: <TestCurrentChart drills />,
        metabotInitialState: makeVisibleState(),
      });

      act(() => {
        store.dispatch(metabotActions.setNavigateToPath("/question#abc"));
      });

      expect(
        await screen.findByTestId("mock-interactive-question"),
      ).toBeInTheDocument();
    });

    it("updates when a second navigate_to fires", async () => {
      const { store } = setup({
        ui: <TestCurrentChart />,
        metabotInitialState: makeVisibleState(),
      });

      act(() => {
        store.dispatch(metabotActions.setNavigateToPath("/question#first"));
      });

      const chart = await screen.findByTestId("mock-static-question");
      expect(chart).toHaveAttribute("data-query", "/question#first");

      act(() => {
        store.dispatch(metabotActions.setNavigateToPath("/question#second"));
      });

      await waitFor(() => {
        expect(screen.getByTestId("mock-static-question")).toHaveAttribute(
          "data-query",
          "/question#second",
        );
      });
    });
  });
});
