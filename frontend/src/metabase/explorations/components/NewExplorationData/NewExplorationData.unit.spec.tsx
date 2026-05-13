import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { ExplorationMetric } from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
import type { MetricDimension, Timeline } from "metabase-types/api";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";
import { createMockTimeline } from "metabase-types/api/mocks/timeline";

import { NewExplorationData } from "./NewExplorationData";

// `AddMetricsModal` and `AddTimelinesModal` pull in heavy
// dependencies (virtual lists, metabase-lib metadata). We don't
// need to render them in these tests; stubbing keeps things fast
// and lets us assert WHICH modal was opened by inspecting test-id
// presence/visibility props.
jest.mock("./AddMetricsModal", () => ({
  AddMetricsModal: ({ opened }: { opened: boolean }) =>
    opened ? <div data-testid="add-metrics-modal" /> : null,
}));
jest.mock("./AddTimelinesModal", () => ({
  AddTimelinesModal: ({ opened }: { opened: boolean }) =>
    opened ? <div data-testid="add-timelines-modal" /> : null,
}));

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useMetabotAgent: jest.fn(),
}));

const createdAtMonth = createMockMetricDimension({
  id: "orders.created_at.month",
  display_name: "Created At",
  group: {
    id: "orders.created_at",
    type: "main",
    display_name: "Orders",
  },
  sources: [{ type: "field", "field-id": 1 }],
});
const createdAtQuarter = createMockMetricDimension({
  id: "orders.created_at.quarter",
  display_name: "Created At",
  group: {
    id: "orders.created_at",
    type: "main",
    display_name: "Orders",
  },
  sources: [{ type: "field", "field-id": 1 }],
});
const plan = createMockMetricDimension({
  id: "accounts.plan",
  display_name: "Plan",
  sources: [{ type: "field", "field-id": 2 }],
});

function setup({
  metrics = [],
  dimensions = [],
  timelines = [],
}: {
  metrics?: ExplorationMetric[];
  dimensions?: MetricDimension[];
  timelines?: Timeline[];
} = {}) {
  jest.mocked(useMetabotAgent).mockReturnValue({
    messages: [],
  } as any);

  const setMetrics = jest.fn();
  const setDimensions = jest.fn();
  const setTimelines = jest.fn();

  renderWithProviders(
    <NewExplorationData
      metrics={metrics}
      setMetrics={setMetrics}
      dimensions={dimensions}
      setDimensions={setDimensions}
      timelines={timelines}
      setTimelines={setTimelines}
      name={null}
    />,
  );

  return { setMetrics, setDimensions, setTimelines };
}

describe("NewExplorationData", () => {
  it("removes all dimensions represented by a grouped dimension pill", async () => {
    const { setDimensions } = setup({
      dimensions: [createdAtMonth, createdAtQuarter, plan],
    });

    expect(screen.getByText("Orders - Created At")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(setDimensions).toHaveBeenCalledTimes(1);
    expect(setDimensions).toHaveBeenCalledWith([plan]);
  });

  describe("removing a metric pill", () => {
    const revenueMetric = createMockMetric({
      id: 1,
      name: "Revenue",
      dimension_ids: [createdAtMonth.id, plan.id],
    }) as ExplorationMetric;
    const churnMetric = createMockMetric({
      id: 2,
      name: "Churn",
      dimension_ids: [plan.id],
    }) as ExplorationMetric;

    /**
     * Mantine `Pill`'s remove button uses a generic `aria-label="Remove"`
     * for every pill, so we resolve which button to click by index. The
     * metric `PillList` renders before the dimension `PillList` in the
     * DOM, so the first `metrics.length` Remove buttons are the metric
     * pills (in `metrics` order), followed by the dimension pills.
     */
    function clickMetricRemove(index: number): Promise<void> {
      return userEvent.click(
        screen.getAllByRole("button", { name: "Remove" })[index],
      );
    }

    it("drops dimensions that no remaining metric uses", async () => {
      const { setMetrics, setDimensions } = setup({
        metrics: [revenueMetric],
        dimensions: [createdAtMonth, plan],
      });

      // Index 0 = Revenue (the only metric). Removing it orphans both
      // dimensions.
      await clickMetricRemove(0);

      expect(setMetrics).toHaveBeenCalledWith([]);
      expect(setDimensions).toHaveBeenCalledWith([]);
    });

    it("keeps dimensions still used by another metric", async () => {
      const { setMetrics, setDimensions } = setup({
        metrics: [revenueMetric, churnMetric],
        dimensions: [createdAtMonth, plan],
      });

      // Index 0 = Revenue. createdAt is orphaned (only Revenue used it);
      // Plan stays (Churn still uses it).
      await clickMetricRemove(0);

      expect(setMetrics).toHaveBeenCalledWith([churnMetric]);
      expect(setDimensions).toHaveBeenCalledWith([plan]);
    });

    it("does not call setDimensions when no dimensions need to be dropped", async () => {
      // Revenue uses [createdAt, plan]; an extra user-added dimension that
      // no metric references should NOT be dropped, and setDimensions
      // should not be called when the metric's dims are still used.
      const extraDim = createMockMetricDimension({
        id: "accounts.region",
        display_name: "Region",
        sources: [{ type: "field", "field-id": 3 }],
      });
      const { setMetrics, setDimensions } = setup({
        metrics: [revenueMetric, churnMetric],
        dimensions: [plan, extraDim],
      });

      // Index 1 = Churn. Churn only uses `plan`, which Revenue also
      // uses, so no dimensions become orphaned.
      await clickMetricRemove(1);

      expect(setMetrics).toHaveBeenCalledWith([revenueMetric]);
      expect(setDimensions).not.toHaveBeenCalled();
    });
  });

  describe("empty state (no metrics, dimensions, or timelines)", () => {
    it("renders the two top-level section headers, descriptions, and a disabled Begin research button", () => {
      setup();

      // Two top-level section headers ("Data" + "Timelines"),
      // each with a + button and a description paragraph below.
      // The CTA is disabled (no metrics + dimensions selected).
      expect(screen.getByText("Data")).toBeInTheDocument();
      expect(screen.getByText("Timelines")).toBeInTheDocument();
      expect(
        screen.getByText(/Add metrics and dimensions you'd like to see/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Add timelines to see if events shed light/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Begin research" }),
      ).toBeDisabled();
      // No Metrics / Dimensions sub-headers — those only appear
      // inside the sub-accordion that lives below "Data" in the
      // filled state.
      expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
      expect(screen.queryByText("Dimensions")).not.toBeInTheDocument();
    });

    it("opens the AddMetricsModal when the Data add icon is clicked", async () => {
      setup();

      await userEvent.click(
        screen.getByRole("button", { name: "Add metrics and dimensions" }),
      );

      expect(screen.getByTestId("add-metrics-modal")).toBeInTheDocument();
    });

    it("opens the AddTimelinesModal when the Timelines add icon is clicked", async () => {
      setup();

      await userEvent.click(
        screen.getByRole("button", { name: "Add timelines" }),
      );

      expect(screen.getByTestId("add-timelines-modal")).toBeInTheDocument();
    });
  });

  describe("filled state", () => {
    const revenueMetric = createMockMetric({
      id: 1,
      name: "Revenue",
      dimension_ids: [createdAtMonth.id],
    }) as ExplorationMetric;

    it("renders a Data header + Metrics/Dimensions sub-accordion when a metric is added", () => {
      setup({ metrics: [revenueMetric], dimensions: [createdAtMonth] });

      // Top-level "Data" header still rendered (non-collapsible).
      expect(screen.getByText("Data")).toBeInTheDocument();
      // Sub-accordion controls.
      expect(screen.getByText("Metrics")).toBeInTheDocument();
      expect(screen.getByText("Dimensions")).toBeInTheDocument();
      // Pills inside the expanded sub-panels — proves both panels
      // start expanded.
      expect(screen.getByText("Revenue")).toBeInTheDocument();
      expect(screen.getByText("Orders - Created At")).toBeInTheDocument();
      // The empty-state description is gone.
      expect(
        screen.queryByText(/Add metrics and dimensions you'd like to see/),
      ).not.toBeInTheDocument();
    });

    it("keeps the Timelines section static when only metrics/dimensions are added", () => {
      setup({ metrics: [revenueMetric], dimensions: [createdAtMonth] });

      // Timelines header still present, but rendered as a static
      // section with its empty-state description — it doesn't get
      // promoted to an accordion item until at least one timeline
      // exists.
      expect(screen.getByText("Timelines")).toBeInTheDocument();
      expect(
        screen.getByText(/Add timelines to see if events shed light/),
      ).toBeInTheDocument();
    });

    it("promotes the Timelines section into a collapsible accordion once a timeline is added", () => {
      const timeline = createMockTimeline({ id: 99, name: "Releases" });
      setup({ timelines: [timeline] });

      // Data section stays in its empty shape (static header +
      // description), since no metrics/dimensions exist yet.
      expect(screen.getByText("Data")).toBeInTheDocument();
      expect(
        screen.getByText(/Add metrics and dimensions you'd like to see/),
      ).toBeInTheDocument();
      // Timelines is now a collapsible accordion item — its empty
      // intro paragraph is gone and the timeline pill is visible.
      expect(
        screen.queryByText(/Add timelines to see if events shed light/),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Timelines")).toBeInTheDocument();
      expect(screen.getByText("Releases")).toBeInTheDocument();
    });

    it("clicking the Data + icon opens the AddMetricsModal", async () => {
      setup({ metrics: [revenueMetric], dimensions: [createdAtMonth] });

      await userEvent.click(
        screen.getByRole("button", { name: "Add metrics and dimensions" }),
      );

      expect(screen.getByTestId("add-metrics-modal")).toBeInTheDocument();
      // Sub-accordion content stays visible — opening the modal
      // doesn't collapse the sub-panels.
      expect(screen.getByText("Revenue")).toBeInTheDocument();
    });

    it("clicking the Timelines + icon opens the AddTimelinesModal without toggling the panel", async () => {
      const timeline = createMockTimeline({ id: 99, name: "Releases" });
      setup({
        metrics: [revenueMetric],
        dimensions: [createdAtMonth],
        timelines: [timeline],
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Add timelines" }),
      );

      expect(screen.getByTestId("add-timelines-modal")).toBeInTheDocument();
      // Timelines panel still expanded — the pill is visible.
      expect(screen.getByText("Releases")).toBeInTheDocument();
    });
  });
});
