import userEvent from "@testing-library/user-event";
import { useEffect, useImperativeHandle, useRef } from "react";

import { setupExplorationDataEndpoint } from "__support__/server-mocks/metric";
import { setupTimelinesEndpoints } from "__support__/server-mocks/timeline";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import { useExplorationSelection } from "metabase/explorations/hooks";
import {
  makeMockNavigation,
  mockMetricBlock,
} from "metabase/explorations/test-utils";
import type { ExplorationMetric } from "metabase/explorations/types";
import type { MetricDimension } from "metabase-types/api";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import { BrowseDimensionsPanel } from "./BrowseDimensionsPanel";

const dimRevenue = createMockMetricDimension({
  id: "dim-revenue",
  display_name: "Customer size",
  sources: [{ type: "field", "field-id": 1 }],
  dimension_interestingness: 0.9,
});
const dimChurn = createMockMetricDimension({
  id: "dim-churn",
  display_name: "Plan",
  sources: [{ type: "field", "field-id": 2 }],
  dimension_interestingness: 0.9,
});
const dimShared = createMockMetricDimension({
  id: "dim-shared",
  display_name: "Country",
  sources: [{ type: "field", "field-id": 3 }],
  dimension_interestingness: 0.9,
});

const metricRevenue = createMockMetric({
  id: 1,
  name: "Monthly recurring revenue",
  description: "Revenue per month",
  dimension_ids: [dimRevenue.id, dimShared.id],
  dimensions: [dimRevenue, dimShared],
});
const metricChurn = createMockMetric({
  id: 2,
  name: "Churn rate",
  description: "Customers lost",
  dimension_ids: [dimChurn.id, dimShared.id],
  dimensions: [dimChurn, dimShared],
});

const revenueAsMetric = metricRevenue as ExplorationMetric;
const churnAsMetric = metricChurn as ExplorationMetric;

interface SetupOpts {
  initialMetrics?: ExplorationMetric[];
  initialDimensions?: MetricDimension[];
}

/**
 * Harness owning the real `useExplorationSelection` hook so the Browse
 * Dimensions panel is exercised end-to-end against the production
 * cascade/orphan toggle rules. Tests read the live selection via
 * `selectionRef.current`.
 */
function Harness({
  initialMetrics,
  initialDimensions,
  selectionRef,
}: {
  initialMetrics: ExplorationMetric[];
  initialDimensions: MetricDimension[];
  selectionRef: React.MutableRefObject<ExplorationSelection | null>;
}) {
  const selection = useExplorationSelection();

  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) {
      return;
    }
    seededRef.current = true;
    if (initialMetrics.length > 0) {
      const dimIds = new Set(initialDimensions.map((d) => d.id));
      const blocks = initialMetrics.map((metric) =>
        mockMetricBlock(
          metric,
          initialDimensions.filter(
            (d) => metric.dimension_ids.includes(d.id) && dimIds.has(d.id),
          ),
        ),
      );
      selection.setBlocks(blocks);
    }
  }, [initialMetrics, initialDimensions, selection]);

  useImperativeHandle(selectionRef, () => selection, [selection]);

  return (
    <BrowseDimensionsPanel
      selection={selection}
      navigation={makeMockNavigation()}
    />
  );
}

function setup({
  initialMetrics = [],
  initialDimensions = [],
}: SetupOpts = {}) {
  setupTimelinesEndpoints([]);
  setupExplorationDataEndpoint([metricRevenue, metricChurn]);

  const selectionRef: React.MutableRefObject<ExplorationSelection | null> = {
    current: null,
  };

  renderWithProviders(
    <Harness
      initialMetrics={initialMetrics}
      initialDimensions={initialDimensions}
      selectionRef={selectionRef}
    />,
  );

  return {
    getSelection: () => {
      const sel = selectionRef.current;
      if (!sel) {
        throw new Error("Selection ref was not populated");
      }
      return sel;
    },
  };
}

describe("BrowseDimensionsPanel", () => {
  beforeAll(() => {
    mockGetBoundingClientRect({ height: 600, width: 600 });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("renders the union of the metrics' dimensions", async () => {
    setup();

    expect(await screen.findByText("Customer size")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Country")).toBeInTheDocument();
  });

  it("clicking a dimension creates a dimension block hydrated with every metric that references it", async () => {
    const { getSelection } = setup();

    const checkbox = await screen.findByRole("checkbox", { name: "Country" });
    await userEvent.click(checkbox);

    // One dimension block lives in `blocks`; its body lists every
    // metric that references the dimension as a secondary item.
    const blocks = getSelection().blocks;
    expect(blocks).toHaveLength(1);
    const dimBlock = blocks[0];
    if (dimBlock.kind !== "dimension") {
      throw new Error(
        `Expected the toggled block to be a dimension block, got "${dimBlock.kind}"`,
      );
    }
    expect(dimBlock.dimension.id).toBe(dimShared.id);
    expect(dimBlock.metrics.map((m) => m.id).sort()).toEqual(
      [metricRevenue.id, metricChurn.id].sort(),
    );

    // The derived flat aggregates surface everything across blocks for
    // the BE POST body.
    expect(getSelection().dimensions.map((d) => d.id)).toEqual([dimShared.id]);
    expect(
      getSelection()
        .metrics.map((m) => m.id)
        .sort(),
    ).toEqual([metricRevenue.id, metricChurn.id].sort());
  });

  it("clicking a dimension twice toggles its block on and then off", async () => {
    const { getSelection } = setup();

    const checkbox = await screen.findByRole("checkbox", { name: "Country" });
    await userEvent.click(checkbox);
    expect(getSelection().blocks).toHaveLength(1);

    await userEvent.click(checkbox);
    expect(getSelection().blocks).toEqual([]);
    expect(getSelection().dimensions).toEqual([]);
    expect(getSelection().metrics).toEqual([]);
  });

  it("a dimension is shown selected only when its own block exists, not when it merely sits inside a metric block", async () => {
    const { getSelection } = setup({
      initialMetrics: [revenueAsMetric, churnAsMetric],
      initialDimensions: [dimShared],
    });

    // Initially `dimShared` is inside both metric blocks but no
    // dimension block — the picker shows it as **unchecked**.
    const checkbox = await screen.findByRole("checkbox", { name: "Country" });
    expect(checkbox).not.toBeChecked();

    // Toggling on creates a dedicated dimension block. The picker
    // then shows it as checked. The metric blocks are untouched.
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(
      getSelection()
        .blocks.filter((b) => b.kind === "metric")
        .map((b) => (b as { metric: { id: number } }).metric.id)
        .sort(),
    ).toEqual([metricRevenue.id, metricChurn.id].sort());
    expect(getSelection().blocks.some((b) => b.kind === "dimension")).toBe(
      true,
    );
  });

  it("filters the dimension list down to the matching metric's dimensions", async () => {
    setup();

    await screen.findByText("Customer size");

    // The search hits the metric query — typing a metric name narrows
    // the list to that metric's dimensions ("Churn rate" uses Plan +
    // Country, so "Customer size" from the revenue metric drops out).
    await userEvent.type(
      screen.getByPlaceholderText("Search for a dimension"),
      "churn",
    );

    await waitFor(
      () => {
        expect(screen.queryByText("Customer size")).not.toBeInTheDocument();
        expect(screen.getByText("Plan")).toBeInTheDocument();
        expect(screen.getByText("Country")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });
});
