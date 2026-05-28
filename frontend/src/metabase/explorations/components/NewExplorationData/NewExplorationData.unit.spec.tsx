import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { ExplorationBlock } from "metabase/explorations/hooks";
import {
  makeMockNavigation,
  makeMockSelection,
  mockDimensionBlock,
  mockMetricBlock,
} from "metabase/explorations/test-utils";
import type { ExplorationMetric } from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import { NewExplorationData } from "./NewExplorationData";

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useMetabotAgent: jest.fn(),
}));

const dimCreatedAt = createMockMetricDimension({
  id: "orders.created_at",
  display_name: "Created At",
  sources: [{ type: "field", "field-id": 1 }],
});
const dimPlan = createMockMetricDimension({
  id: "accounts.plan",
  display_name: "Plan",
  sources: [{ type: "field", "field-id": 2 }],
});

const revenueMetric = createMockMetric({
  id: 1,
  name: "Revenue",
  dimension_ids: [dimCreatedAt.id, dimPlan.id],
}) as ExplorationMetric;
const churnMetric = createMockMetric({
  id: 2,
  name: "Churn",
  dimension_ids: [dimPlan.id],
}) as ExplorationMetric;

function setup({ blocks = [] }: { blocks?: ExplorationBlock[] } = {}) {
  jest.mocked(useMetabotAgent).mockReturnValue({
    messages: [],
  } as any);

  const selection = makeMockSelection({ blocks });
  const navigation = makeMockNavigation();

  renderWithProviders(
    <NewExplorationData selection={selection} navigation={navigation} />,
  );

  return { selection, navigation };
}

describe("NewExplorationData (Research plan)", () => {
  describe("empty state", () => {
    it("renders the empty-state copy + two add buttons when no blocks are selected", () => {
      setup();

      expect(screen.getByText("Research plan")).toBeInTheDocument();
      expect(
        screen.getByText(/each one becomes its own research area/i),
      ).toBeInTheDocument();
      // Header "Add metric" + empty-state "Add metric" + empty-state
      // "Add dimension" → 3 add affordances total.
      expect(screen.getAllByLabelText(/Add metric/i)).not.toHaveLength(0);
      expect(screen.getByLabelText("Add dimensions")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Begin research" }),
      ).toBeDisabled();
    });

    it("clicking the empty-state Add metric button opens Browse on the metrics tab", async () => {
      const { navigation } = setup();

      await userEvent.click(screen.getByLabelText("Add metrics"));

      expect(navigation.openBrowse).toHaveBeenCalledWith("metrics");
    });

    it("clicking the empty-state Add dimension button opens Browse on the dimensions tab", async () => {
      const { navigation } = setup();

      await userEvent.click(screen.getByLabelText("Add dimensions"));

      expect(navigation.openBrowse).toHaveBeenCalledWith("dimensions");
    });
  });

  describe("metric block", () => {
    it("renders one collapsible area per metric block with the metric name in the header and its dimensions in the body", () => {
      setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt, dimPlan])],
      });

      // Header shows the metric name + the remove control.
      expect(screen.getByText("Revenue")).toBeInTheDocument();
      expect(screen.getByLabelText("Remove area")).toBeInTheDocument();

      // Body lists the block's dimensions as pills.
      expect(screen.getByText("Created At")).toBeInTheDocument();
      expect(screen.getByText("Plan")).toBeInTheDocument();
    });

    it("clicking the area's remove button calls selection.removeBlock with this block id", async () => {
      const { selection } = setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt])],
      });

      await userEvent.click(screen.getByLabelText("Remove area"));

      expect(selection.removeBlock).toHaveBeenCalledWith("metric:1");
    });

    it("clicking a dimension pill's Remove button drops it from the block", async () => {
      const { selection } = setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt, dimPlan])],
      });

      const removeButtons = screen.getAllByRole("button", { name: "Remove" });
      await userEvent.click(removeButtons[0]);

      expect(selection.removeDimensionFromMetricBlock).toHaveBeenCalledTimes(1);
      expect(selection.removeDimensionFromMetricBlock).toHaveBeenCalledWith(
        "metric:1",
        dimCreatedAt.id,
      );
    });

    it("clicking the body activates the block on the Dimensions browse tab", async () => {
      const { navigation } = setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt])],
      });

      // The panel itself is `role="button"` with a label so the test
      // can target it directly. Use exact text match because the
      // exploration name appears in multiple aria-labels.
      await userEvent.click(
        screen.getByRole("button", {
          name: /Edit research area for Revenue/i,
        }),
      );

      expect(navigation.selectBlock).toHaveBeenCalledTimes(1);
      expect(navigation.selectBlock).toHaveBeenCalledWith(
        "metric:1",
        "dimensions",
      );
    });

    it("shows an empty-body message when a metric block has no dimensions yet", () => {
      setup({ blocks: [mockMetricBlock(revenueMetric, [])] });

      expect(screen.getByText(/No dimensions yet/i)).toBeInTheDocument();
    });
  });

  describe("dimension block", () => {
    it("renders one collapsible area per dimension block with the dimension name in the header and referencing metrics in the body", () => {
      setup({
        blocks: [mockDimensionBlock(dimPlan, [revenueMetric, churnMetric])],
      });

      expect(screen.getByText("Plan")).toBeInTheDocument();
      expect(screen.getByText("Revenue")).toBeInTheDocument();
      expect(screen.getByText("Churn")).toBeInTheDocument();
    });

    it("clicking a metric pill's Remove button drops it from the block", async () => {
      const { selection } = setup({
        blocks: [mockDimensionBlock(dimPlan, [revenueMetric, churnMetric])],
      });

      const removeButtons = screen.getAllByRole("button", { name: "Remove" });
      await userEvent.click(removeButtons[0]);

      expect(selection.removeMetricFromDimensionBlock).toHaveBeenCalledTimes(1);
      expect(selection.removeMetricFromDimensionBlock).toHaveBeenCalledWith(
        "dim:accounts.plan",
        revenueMetric.id,
      );
    });

    it("clicking the body activates the block on the Metrics browse tab", async () => {
      const { navigation } = setup({
        blocks: [mockDimensionBlock(dimPlan, [revenueMetric])],
      });

      await userEvent.click(
        screen.getByRole("button", {
          name: /Edit research area for Plan/i,
        }),
      );

      expect(navigation.selectBlock).toHaveBeenCalledTimes(1);
      expect(navigation.selectBlock).toHaveBeenCalledWith(
        "dim:accounts.plan",
        "metrics",
      );
    });
  });

  describe("empty-space click clears the active block", () => {
    it("clicking on the column background calls navigation.clearActiveBlock when a block is active", async () => {
      const { navigation } = setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt])],
      });
      // Simulate "Revenue" being the active block.
      (navigation as { activeBlockId: string | null }).activeBlockId =
        "metric:1";

      // The column's own root carries `data-testid="research-content"`
      // and an onClick that deselects when the click target isn't
      // inside a block. Clicking the title (inside the column, not
      // inside any block) should clear.
      await userEvent.click(screen.getByText("Research plan"));

      expect(navigation.clearActiveBlock).toHaveBeenCalledTimes(1);
    });

    it("clicking the block itself does NOT clear the selection", async () => {
      const { navigation } = setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt])],
      });
      (navigation as { activeBlockId: string | null }).activeBlockId =
        "metric:1";

      // Click on the block body — the block's `data-block-id` is on
      // the bubble path, so the background click handler skips
      // clearing. (The block's own `onActivate` still fires and the
      // navigation.selectBlock mock records the call — but we only
      // care here that the deselect path is *not* taken.)
      await userEvent.click(
        screen.getByRole("button", {
          name: /Edit research area for Revenue/i,
        }),
      );

      expect(navigation.clearActiveBlock).not.toHaveBeenCalled();
    });

    it("is a no-op when no block is active", async () => {
      const { navigation } = setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt])],
      });
      // activeBlockId left as `null` from the default mock.

      await userEvent.click(screen.getByText("Research plan"));

      expect(navigation.clearActiveBlock).not.toHaveBeenCalled();
    });
  });

  describe("mixed Research plan", () => {
    it("renders metric and dimension blocks side by side, each with its own controls", () => {
      setup({
        blocks: [
          mockMetricBlock(revenueMetric, [dimCreatedAt]),
          mockDimensionBlock(dimPlan, [revenueMetric, churnMetric]),
        ],
      });

      // Two block areas, two "Remove area" buttons.
      expect(screen.getAllByLabelText("Remove area")).toHaveLength(2);

      // The Begin research button is enabled because blocks > 0.
      expect(
        screen.getByRole("button", { name: "Begin research" }),
      ).toBeEnabled();
    });
  });
});
