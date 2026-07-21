import userEvent from "@testing-library/user-event";

import { setupExplorationDataEndpoint } from "__support__/server-mocks/metric";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { useCreateExplorationMutation } from "metabase/api";
import { trackExplorationPlanEdited } from "metabase/explorations/analytics";
import type { ExplorationBlock } from "metabase/explorations/hooks";
import {
  createExploration,
  makeMockSelection,
  mockDimensionBlock,
  mockMetricBlock,
} from "metabase/explorations/test-utils";
import { useMetabotAgent } from "metabase/metabot/hooks";
import type { ExplorationMetric, Timeline } from "metabase-types/api";
import { createMockTimeline } from "metabase-types/api/mocks";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import {
  NewExplorationData,
  buildCreateExplorationRequest,
} from "./NewExplorationData";

jest.mock("metabase/explorations/analytics", () => ({
  trackExplorationCreated: jest.fn(),
  trackExplorationPlanEdited: jest.fn(),
}));

jest.mock("metabase/api", () => ({
  ...jest.requireActual("metabase/api"),
  useCreateExplorationMutation: jest.fn(),
}));

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

// Unjustified type cast. FIXME
const revenueMetric = createMockMetric({
  id: 1,
  name: "Revenue",
  dimension_ids: [dimCreatedAt.id, dimPlan.id],
}) as ExplorationMetric;
// Unjustified type cast. FIXME
const churnMetric = createMockMetric({
  id: 2,
  name: "Churn",
  dimension_ids: [dimPlan.id],
}) as ExplorationMetric;

const createExplorationMock = jest.fn();

function setup({
  blocks = [],
  timelines = [],
  messages = [],
}: {
  blocks?: ExplorationBlock[];
  timelines?: Timeline[];
  messages?: { role: string; message: string }[];
} = {}) {
  // Unjustified type cast. FIXME
  jest.mocked(useMetabotAgent).mockReturnValue({
    messages,
  } as any);

  createExplorationMock.mockReturnValue({
    unwrap: () => Promise.resolve(createExploration()),
  });
  jest
    .mocked(useCreateExplorationMutation)
    // RTK mutation hook mock only needs trigger + isLoading from the tuple.
    .mockReturnValue([createExplorationMock, { isLoading: false }] as any);

  // The Add* modals fetch this on mount even while closed.
  setupExplorationDataEndpoint([]);

  const selection = makeMockSelection({ blocks, timelines });

  renderWithProviders(<NewExplorationData selection={selection} />);

  return { selection };
}

describe("NewExplorationData (Research plan)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("empty state", () => {
    it("renders the header + the +Data / +Events affordances, with no Start research CTA yet", () => {
      setup();

      expect(screen.getByText("Research plan")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Data/ })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Events/ }),
      ).toBeInTheDocument();
    });

    it("opens the metrics modal from the +Data menu", async () => {
      setup();

      await userEvent.click(screen.getByRole("button", { name: /Data/ }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Metrics" }));

      expect(
        await screen.findByText("Add metrics to your research plan"),
      ).toBeInTheDocument();
    });
  });

  describe("metric block", () => {
    it("renders collapsed by default, showing selected dimensions as plain (non-toggle) pills", () => {
      setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt, dimPlan])],
      });

      expect(screen.getByText("Revenue")).toBeInTheDocument();
      expect(screen.getByLabelText("Remove area")).toBeInTheDocument();

      // Collapsed: dimensions show as plain pills, not toggle buttons.
      expect(
        screen.queryByRole("button", { name: "Created At" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Created At")).toBeInTheDocument();
    });

    it("expands a collapsed block when its (read-only) body is clicked", async () => {
      setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt, dimPlan])],
      });

      // Collapsed: the dimension is a plain pill, not a toggle button.
      expect(
        screen.queryByRole("button", { name: "Created At" }),
      ).not.toBeInTheDocument();

      // Clicking the collapsed body expands the block.
      await userEvent.click(screen.getByText("Created At"));

      expect(
        screen.getByRole("button", { name: "Created At" }),
      ).toHaveAttribute("aria-pressed", "true");
    });

    it("expanding groups dimensions into source sections of toggle pills", async () => {
      setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt, dimPlan])],
      });

      await userEvent.click(screen.getByRole("button", { name: "Expand" }));

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

      await userEvent.click(screen.getByRole("button", { name: "Expand" }));
      await userEvent.click(screen.getByRole("button", { name: "Created At" }));

      expect(selection.toggleDimensionSelected).toHaveBeenCalledWith(
        "metric:1",
        dimCreatedAt.id,
      );
      expect(trackExplorationPlanEdited).toHaveBeenCalledTimes(1);
      expect(trackExplorationPlanEdited).toHaveBeenCalledWith(
        "manual",
        "dimensions",
      );
      expect(trackExplorationPlanEdited).not.toHaveBeenCalledWith(
        "manual",
        "metrics",
      );
    });

    it("clicking the area's remove button calls selection.removeBlock", async () => {
      const { selection } = setup({
        blocks: [mockMetricBlock(revenueMetric, [dimCreatedAt])],
      });

      await userEvent.click(screen.getByLabelText("Remove area"));

      expect(selection.removeBlock).toHaveBeenCalledWith("metric:1");
      expect(trackExplorationPlanEdited).toHaveBeenCalledTimes(1);
      expect(trackExplorationPlanEdited).toHaveBeenCalledWith(
        "manual",
        "metrics",
      );
      expect(trackExplorationPlanEdited).not.toHaveBeenCalledWith(
        "manual",
        "dimensions",
      );
    });
  });

  describe("dimension block", () => {
    it("expanding renders related metrics as toggle pills", async () => {
      setup({
        blocks: [mockDimensionBlock(dimPlan, [revenueMetric, churnMetric])],
      });

      await userEvent.click(screen.getByRole("button", { name: "Expand" }));

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

      await userEvent.click(screen.getByRole("button", { name: "Expand" }));
      await userEvent.click(screen.getByRole("button", { name: "Revenue" }));

      expect(selection.toggleMetricSelected).toHaveBeenCalledWith(
        "dim:accounts.plan",
        revenueMetric.id,
      );
      expect(trackExplorationPlanEdited).toHaveBeenCalledTimes(1);
      expect(trackExplorationPlanEdited).toHaveBeenCalledWith(
        "manual",
        "metrics",
      );
      expect(trackExplorationPlanEdited).not.toHaveBeenCalledWith(
        "manual",
        "dimensions",
      );
    });

    it("clicking the area's remove button tracks a dimensions edit", async () => {
      const { selection } = setup({
        blocks: [mockDimensionBlock(dimPlan, [revenueMetric, churnMetric])],
      });

      await userEvent.click(screen.getByLabelText("Remove area"));

      expect(selection.removeBlock).toHaveBeenCalledWith("dim:accounts.plan");
      expect(trackExplorationPlanEdited).toHaveBeenCalledTimes(1);
      expect(trackExplorationPlanEdited).toHaveBeenCalledWith(
        "manual",
        "dimensions",
      );
      expect(trackExplorationPlanEdited).not.toHaveBeenCalledWith(
        "manual",
        "metrics",
      );
    });
  });

  describe("selected events pills", () => {
    const releasesTimeline = createMockTimeline({ id: 7, name: "Releases" });
    const marketingTimeline = createMockTimeline({ id: 9, name: "Marketing" });

    it("is hidden when nothing is selected", () => {
      setup();
      expect(screen.queryByText("Releases")).not.toBeInTheDocument();
    });

    it("clicking the primary timeline pill unselects it", async () => {
      const { selection } = setup({ timelines: [releasesTimeline] });

      await userEvent.click(
        screen.getByRole("button", { name: "Remove Releases" }),
      );
      expect(selection.removeTimelinesById).toHaveBeenCalledWith([
        releasesTimeline.id,
      ]);
      expect(trackExplorationPlanEdited).toHaveBeenCalledTimes(1);
      expect(trackExplorationPlanEdited).toHaveBeenCalledWith(
        "manual",
        "timelines",
      );
      expect(trackExplorationPlanEdited).not.toHaveBeenCalledWith(
        "manual",
        "metrics",
      );
      expect(trackExplorationPlanEdited).not.toHaveBeenCalledWith(
        "manual",
        "dimensions",
      );
    });

    it("shows the first picked timeline plus a +N overflow pill", () => {
      setup({ timelines: [releasesTimeline, marketingTimeline] });

      expect(screen.getByText("Releases")).toBeInTheDocument();
      expect(screen.queryByText("Marketing")).not.toBeInTheDocument();
      expect(screen.getByText("+1")).toBeInTheDocument();
    });
  });

  describe("buildCreateExplorationRequest", () => {
    const releasesTimeline = createMockTimeline({ id: 7, name: "Releases" });
    const launchTimeline = createMockTimeline({ id: 9, name: "Launches" });

    it("sends only the selected dimensions of a metric block", () => {
      const block = mockMetricBlock(
        revenueMetric,
        [dimCreatedAt, dimPlan],
        new Set([dimCreatedAt.id]),
      );
      const request = buildCreateExplorationRequest("n", "", [block], [], null);

      expect(request.blocks[0].dimensions.map((d) => d.dimension_id)).toEqual([
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
      const request = buildCreateExplorationRequest("n", "", [block], [], null);

      expect(request.blocks[0].metrics.map((m) => m.card_id)).toEqual([
        churnMetric.id,
      ]);
    });

    it("sends thread-scoped timeline_ids at the top level (not per block) and tags each block's anchor type", () => {
      const request = buildCreateExplorationRequest(
        "My exploration",
        "",
        [
          mockMetricBlock(revenueMetric, [dimCreatedAt]),
          mockDimensionBlock(dimPlan, [churnMetric]),
        ],
        [releasesTimeline, launchTimeline],
        null,
      );

      expect(request.timeline_ids).toEqual([7, 9]);
      expect(request.blocks).toHaveLength(2);
      // blocks no longer carry timeline_ids
      for (const block of request.blocks) {
        expect(block).not.toHaveProperty("timeline_ids");
      }
      expect(request.blocks[0].type).toBe("metric");
      expect(request.blocks[1].type).toBe("dimension");
    });

    it("uses empty timeline_ids when none are selected", () => {
      const request = buildCreateExplorationRequest(
        "My exploration",
        "",
        [mockMetricBlock(revenueMetric, [dimCreatedAt])],
        [],
        null,
      );

      expect(request.timeline_ids).toEqual([]);
    });

    it("trims the prompt and falls back to null when blank", () => {
      expect(
        buildCreateExplorationRequest("n", "  hello  ", [], [], null).prompt,
      ).toBe("hello");
      expect(
        buildCreateExplorationRequest("n", "   ", [], [], null).prompt,
      ).toBeNull();
    });
  });

  describe("contextual interestingness toggle", () => {
    const metricBlock = mockMetricBlock(revenueMetric, [dimCreatedAt]);
    const userQuestion = "What drives churn?";

    it("does not render the toggle when there are no user messages", () => {
      setup({ blocks: [metricBlock] });

      expect(
        screen.queryByRole("switch", {
          name: /Use AI to order charts by interestingness/,
        }),
      ).not.toBeInTheDocument();
    });

    it("renders the toggle on by default when there are user messages", () => {
      setup({
        blocks: [metricBlock],
        messages: [{ role: "user", message: userQuestion }],
      });

      expect(
        screen.getByRole("switch", {
          name: /Use AI to order charts by interestingness/,
        }),
      ).toBeChecked();
    });

    it("sends the prompt when the toggle is on", async () => {
      setup({
        blocks: [metricBlock],
        messages: [{ role: "user", message: userQuestion }],
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Start research" }),
      );

      await waitFor(() => {
        expect(createExplorationMock).toHaveBeenCalledWith(
          expect.objectContaining({ prompt: userQuestion }),
        );
      });
    });

    it("omits the prompt when the toggle is off", async () => {
      setup({
        blocks: [metricBlock],
        messages: [{ role: "user", message: userQuestion }],
      });

      await userEvent.click(
        screen.getByRole("switch", {
          name: /Use AI to order charts by interestingness/,
        }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Start research" }),
      );

      await waitFor(() => {
        expect(createExplorationMock).toHaveBeenCalledWith(
          expect.objectContaining({ prompt: null }),
        );
      });
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
