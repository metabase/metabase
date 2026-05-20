import userEvent from "@testing-library/user-event";
import { useEffect, useImperativeHandle, useRef } from "react";

import { setupExplorationDataEndpoint } from "__support__/server-mocks/metric";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import { useExplorationSelection } from "metabase/explorations/hooks";
import type { ExplorationMetric } from "metabase/explorations/types";
import type { MetricDimension } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import { BrowseMetricsPanel } from "./BrowseMetricsPanel";

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
const dimLibrary = createMockMetricDimension({
  id: "dim-library",
  display_name: "Tier",
  sources: [{ type: "field", "field-id": 4 }],
  dimension_interestingness: 0.9,
});
const dimBoring = createMockMetricDimension({
  id: "dim-boring",
  display_name: "Color",
  sources: [{ type: "field", "field-id": 5 }],
  dimension_interestingness: 0.2,
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
const metricLibrary = createMockMetric({
  id: 3,
  name: "Active users",
  description: "Daily active users",
  dimension_ids: [dimLibrary.id],
  dimensions: [dimLibrary],
  collection: createMockCollection({ type: "library-metrics" }),
});

const revenueAsMetric = metricRevenue as ExplorationMetric;
const churnAsMetric = metricChurn as ExplorationMetric;

interface SetupOpts {
  initialMetrics?: ExplorationMetric[];
  initialDimensions?: MetricDimension[];
  extraMetrics?: ExplorationMetric[];
}

/**
 * Harness owning the real `useExplorationSelection` hook so the Browse
 * Metrics panel is exercised end-to-end against the production toggle
 * rules (auto-add interesting dimensions, orphan-metric drop). Tests
 * read the live selection via `selectionRef.current`.
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

  return <BrowseMetricsPanel selection={selection} />;
}

function setup({
  initialMetrics = [],
  initialDimensions = [],
  extraMetrics = [],
}: SetupOpts = {}) {
  setupExplorationDataEndpoint([
    metricRevenue,
    metricChurn,
    metricLibrary,
    ...extraMetrics,
  ]);

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

describe("BrowseMetricsPanel", () => {
  beforeAll(() => {
    mockGetBoundingClientRect({ height: 600, width: 600 });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("renders the metrics fetched from the API", async () => {
    setup();

    expect(
      await screen.findByText("Monthly recurring revenue"),
    ).toBeInTheDocument();
    expect(screen.getByText("Churn rate")).toBeInTheDocument();
    expect(screen.getByText("Active users")).toBeInTheDocument();
  });

  it("checking a metric commits it + its interesting dimensions immediately", async () => {
    const { getSelection } = setup();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Monthly recurring revenue",
    });
    await userEvent.click(checkbox);

    expect(getSelection().metrics.map((m) => m.id)).toEqual([metricRevenue.id]);
    expect(
      getSelection()
        .dimensions.map((d) => d.id)
        .sort(),
    ).toEqual([dimRevenue.id, dimShared.id].sort());
  });

  it("unchecking a metric removes it + drops dimensions no other selected metric uses", async () => {
    const { getSelection } = setup({
      initialMetrics: [revenueAsMetric, churnAsMetric],
      initialDimensions: [dimRevenue, dimChurn, dimShared],
    });

    const checkbox = await screen.findByRole("checkbox", {
      name: "Monthly recurring revenue",
    });
    await userEvent.click(checkbox);

    expect(getSelection().metrics.map((m) => m.id)).toEqual([metricChurn.id]);
    expect(
      getSelection()
        .dimensions.map((d) => d.id)
        .sort(),
    ).toEqual([dimChurn.id, dimShared.id].sort());
  });

  it("filters metrics by search query", async () => {
    setup();

    await screen.findByText("Monthly recurring revenue");

    await userEvent.type(
      screen.getByPlaceholderText("Search for a metric"),
      "churn",
    );

    await waitFor(
      () => {
        expect(screen.getByText("Churn rate")).toBeInTheDocument();
        expect(
          screen.queryByText("Monthly recurring revenue"),
        ).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("renders metric description alongside the name", async () => {
    setup();
    await screen.findByText("Monthly recurring revenue");
    const row = screen
      .getAllByRole("listitem")
      .find((el) =>
        within(el).queryByText("Monthly recurring revenue"),
      ) as HTMLElement;
    expect(within(row).getByText("Revenue per month")).toBeInTheDocument();
  });

  it("checking a metric only auto-picks its interesting dimensions", async () => {
    const metricMixed = createMockMetric({
      id: 99,
      name: "Mixed metric",
      description: null,
      dimension_ids: [dimRevenue.id, dimBoring.id],
      dimensions: [dimRevenue, dimBoring],
    });

    const { getSelection } = setup({
      extraMetrics: [metricMixed as ExplorationMetric],
    });

    const checkbox = await screen.findByRole("checkbox", {
      name: "Mixed metric",
    });
    await userEvent.click(checkbox);

    expect(getSelection().metrics.map((m) => m.id)).toEqual([metricMixed.id]);
    // Only the high-score dim (dimRevenue, 0.9) is auto-picked. The
    // low-score dim (dimBoring, 0.2) is left out.
    expect(getSelection().dimensions.map((d) => d.id)).toEqual([dimRevenue.id]);
  });
});
