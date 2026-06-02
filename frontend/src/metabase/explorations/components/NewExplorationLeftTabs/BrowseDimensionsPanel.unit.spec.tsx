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
      selection.setMetrics(initialMetrics);
    }
    if (initialDimensions.length > 0) {
      selection.setDimensions(initialDimensions);
    }
  }, [initialMetrics, initialDimensions, selection]);

  useImperativeHandle(selectionRef, () => selection, [selection]);

  return <BrowseDimensionsPanel selection={selection} />;
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

  it("clicking a dimension commits it + every metric connected to it", async () => {
    const { getSelection } = setup();

    const checkbox = await screen.findByRole("checkbox", { name: "Country" });
    await userEvent.click(checkbox);

    expect(getSelection().dimensions.map((d) => d.id)).toEqual([dimShared.id]);
    expect(
      getSelection()
        .metrics.map((m) => m.id)
        .sort(),
    ).toEqual([metricRevenue.id, metricChurn.id].sort());
  });

  it("deselecting a shared dimension orphans every metric that loses its last matching dimension", async () => {
    const { getSelection } = setup({
      initialMetrics: [revenueAsMetric, churnAsMetric],
      initialDimensions: [dimShared],
    });

    const checkbox = await screen.findByRole("checkbox", { name: "Country" });
    await userEvent.click(checkbox);

    expect(getSelection().metrics).toEqual([]);
    expect(getSelection().dimensions).toEqual([]);
  });

  it("deselecting a dimension keeps a metric whose other dimension is still selected", async () => {
    const { getSelection } = setup({
      initialMetrics: [revenueAsMetric, churnAsMetric],
      initialDimensions: [dimRevenue, dimShared],
    });

    const checkbox = await screen.findByRole("checkbox", { name: "Country" });
    await userEvent.click(checkbox);

    expect(getSelection().dimensions.map((d) => d.id)).toEqual([dimRevenue.id]);
    expect(getSelection().metrics.map((m) => m.id)).toEqual([metricRevenue.id]);
  });

  it("applies FE-side search to drop dimensions the BE dragged along", async () => {
    setup();

    await screen.findByText("Customer size");

    await userEvent.type(
      screen.getByPlaceholderText("Search for a dimension"),
      "plan",
    );

    // The refetch shows a loading spinner that hides the whole list
    await waitFor(
      () => {
        expect(screen.getByText("Plan")).toBeInTheDocument();
        expect(screen.queryByText("Customer size")).not.toBeInTheDocument();
        expect(screen.queryByText("Country")).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });
});
