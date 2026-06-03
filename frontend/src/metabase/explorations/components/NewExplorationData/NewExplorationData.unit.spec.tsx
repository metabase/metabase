import userEvent from "@testing-library/user-event";

import { setupExplorationDataEndpoint } from "__support__/server-mocks/metric";
import { renderWithProviders, screen } from "__support__/ui";
import type { ExplorationBlock } from "metabase/explorations/hooks";
import {
  makeMockSelection,
  mockDimensionBlock,
  mockMetricBlock,
} from "metabase/explorations/test-utils";
import type { ExplorationMetric } from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
import type { Timeline } from "metabase-types/api";
import { createMockTimeline } from "metabase-types/api/mocks";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import {
  NewExplorationData,
  buildCreateExplorationRequest,
} from "./NewExplorationData";

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

function setup({
  blocks = [],
  timelines = [],
}: { blocks?: ExplorationBlock[]; timelines?: Timeline[] } = {}) {
  jest.mocked(useMetabotAgent).mockReturnValue({
    messages: [],
  } as any);

  // The Add* modals fetch this on mount even while closed.
  setupExplorationDataEndpoint([]);

  const selection = makeMockSelection({ blocks, timelines });

  renderWithProviders(<NewExplorationData selection={selection} />);

  return { selection };
}

describe("NewExplorationData (Research plan)", () => {
  describe("empty state", () => {
    it("renders the header, the +Data / +Events affordances, and a disabled Start research CTA", () => {
      setup();

      expect(screen.getByText("Research plan")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Data" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Events" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Start research" }),
      ).toBeDisabled();
    });

    it("opens the metrics modal from the +Data menu", async () => {
      setup();

      await userEvent.click(screen.getByRole("button", { name: "Data" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Metrics" }));

      expect(
        await screen.findByText("Add metrics to your research plan"),
      ).toBeInTheDocument();
    });
  });

  describe("metric block", () => {
    it("expands by default, grouping dimensions into source sections of toggle pills", () => {
      setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt, dimPlan])],
      });

      expect(screen.getByText("Revenue")).toBeInTheDocument();
      expect(screen.getByLabelText("Remove area")).toBeInTheDocument();

      // Expanded: dimensions render as toggle buttons (selected by default).
      const createdAt = screen.getByRole("button", { name: "Created At" });
      expect(createdAt).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Plan" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("toggling a dimension pill calls toggleDimensionSelected", async () => {
      const { selection } = setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt, dimPlan])],
      });

      await userEvent.click(screen.getByRole("button", { name: "Created At" }));

      expect(selection.toggleDimensionSelected).toHaveBeenCalledWith(
        "metric:1",
        dimCreatedAt.id,
      );
    });

    it("collapsing the block shows the selected dimensions as plain (non-toggle) pills", async () => {
      setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt, dimPlan])],
      });

      await userEvent.click(screen.getByRole("button", { name: "Collapse" }));

      // Plain pills are not buttons.
      expect(
        screen.queryByRole("button", { name: "Created At" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Created At")).toBeInTheDocument();
    });

    it("clicking the area's remove button calls selection.removeBlock", async () => {
      const { selection } = setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt])],
      });

      await userEvent.click(screen.getByLabelText("Remove area"));

      expect(selection.removeBlock).toHaveBeenCalledWith("metric:1");
    });
  });

  describe("dimension block", () => {
    it("expands by default, rendering related metrics as toggle pills", () => {
      setup({
        blocks: [mockDimensionBlock(dimPlan, [revenueMetric, churnMetric])],
      });

      expect(screen.getByRole("button", { name: "Revenue" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: "Churn" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("toggling a metric pill calls toggleMetricSelected", async () => {
      const { selection } = setup({
        blocks: [mockDimensionBlock(dimPlan, [revenueMetric, churnMetric])],
      });

      await userEvent.click(screen.getByRole("button", { name: "Revenue" }));

      expect(selection.toggleMetricSelected).toHaveBeenCalledWith(
        "dim:accounts.plan",
        revenueMetric.id,
      );
    });
  });

  describe("selected events tray", () => {
    const releasesTimeline = createMockTimeline({ id: 7, name: "Releases" });

    it("is hidden when nothing is selected", () => {
      setup();
      expect(screen.queryByText("Releases")).not.toBeInTheDocument();
    });

    it("renders a removable pill per selected timeline", async () => {
      const { selection } = setup({ timelines: [releasesTimeline] });

      expect(screen.getByText("Releases")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Remove" }));
      expect(selection.toggleTimeline).toHaveBeenCalledWith(releasesTimeline);
    });
  });

  describe("buildCreateExplorationRequest", () => {
    const releasesTimeline = createMockTimeline({ id: 7, name: "Releases" });

    it("sends only the selected dimensions of a metric block", () => {
      const block = mockMetricBlock(
        revenueMetric,
        [dimCreatedAt, dimPlan],
        new Set([dimCreatedAt.id]),
      );
      const request = buildCreateExplorationRequest("n", "", [block], []);

      expect(request.groups[0].dimensions.map((d) => d.dimension_id)).toEqual([
        dimCreatedAt.id,
      ]);
    });

    it("sends only the selected metrics of a dimension block", () => {
      const block = mockDimensionBlock(
        dimPlan,
        [revenueMetric, churnMetric],
        [dimPlan],
        new Set([churnMetric.id]),
      );
      const request = buildCreateExplorationRequest("n", "", [block], []);

      expect(request.groups[0].metrics.map((m) => m.card_id)).toEqual([
        churnMetric.id,
      ]);
    });

    it("attaches the shared timeline_ids to every group", () => {
      const request = buildCreateExplorationRequest(
        "My exploration",
        "",
        [mockMetricBlock(revenueMetric, [dimCreatedAt])],
        [releasesTimeline],
      );

      expect(request.groups[0].timeline_ids).toEqual([7]);
    });

    it("trims the prompt and falls back to null when blank", () => {
      expect(
        buildCreateExplorationRequest("n", "  hello  ", [], []).prompt,
      ).toBe("hello");
      expect(
        buildCreateExplorationRequest("n", "   ", [], []).prompt,
      ).toBeNull();
    });
  });

  describe("mixed Research plan", () => {
    it("renders metric and dimension blocks each with their own controls and enables Start research", () => {
      setup({
        blocks: [
          mockMetricBlock(revenueMetric, [dimCreatedAt]),
          mockDimensionBlock(dimPlan, [revenueMetric, churnMetric]),
        ],
      });

      expect(screen.getAllByLabelText("Remove area")).toHaveLength(2);
      expect(
        screen.getByRole("button", { name: "Start research" }),
      ).toBeEnabled();
    });
  });
});
