import { screen } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";
import type { DimensionPillBarItem } from "metabase/metrics-viewer/components/DimensionPillBar";
import { MetricsViewerProvider } from "metabase/metrics-viewer/context";
import { createMockMetricsViewerResult } from "metabase/metrics-viewer/test-utils";
import type { MetricsViewerDimensionBreakoutState } from "metabase/metrics-viewer/types/viewer-state";
import { createMockColumn } from "metabase-types/api/mocks";
import { createMockSingleSeries } from "metabase-types/api/mocks/series";

import { MetricsViewerVisualization } from "./MetricsViewerVisualization";

jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="visualization" />),
}));

const dimensionBreakout: MetricsViewerDimensionBreakoutState = {
  id: "location",
  type: "geo",
  label: "State",
  display: "map",
  dimensionMapping: {},
  projectionConfig: {},
};

const stateColumn = createMockColumn({
  name: "STATE",
  display_name: "State",
  base_type: "type/State",
});

const metricColumn = createMockColumn({
  name: "COUNT",
  display_name: "Count",
  base_type: "type/Integer",
});

function createMapSeries(id: number, name: string) {
  return createMockSingleSeries(
    { id, name, display: "map" },
    {
      data: {
        cols: [stateColumn, metricColumn],
        rows: [["CA", 1]],
      },
    },
  );
}

describe("MetricsViewerVisualization", () => {
  it("renders column labels below each split map chart", () => {
    const firstLabel: DimensionPillBarItem = {
      type: "metric",
      slotIndex: 0,
      label: "Customer State",
      icon: "pinmap",
      availableOptions: [],
    };
    const secondLabel: DimensionPillBarItem = {
      type: "metric",
      slotIndex: 1,
      label: "Delivery State",
      icon: "pinmap",
      availableOptions: [],
    };

    const chartColumnLabelsByEntityIndex = new Map([
      [0, firstLabel],
      [1, secondLabel],
    ]);

    const metricsViewerResult = createMockMetricsViewerResult({
      series: [createMapSeries(100, "Orders"), createMapSeries(200, "ARR")],
      definitions: {},
      formulaEntities: [],
      metricSlots: [],
      activeDimensionBreakout: dimensionBreakout,
      cardIdToEntityIndex: { 100: 0, 200: 1 },
      queriesAreLoading: false,
      queriesError: null,
    });

    renderWithProviders(
      <MetricsViewerProvider value={metricsViewerResult}>
        <MetricsViewerVisualization
          chartColumnLabelsByEntityIndex={chartColumnLabelsByEntityIndex}
        />
      </MetricsViewerProvider>,
    );

    expect(screen.getAllByTestId("visualization")).toHaveLength(2);
    expect(screen.getByText("Customer State")).toBeInTheDocument();
    expect(screen.getByText("Delivery State")).toBeInTheDocument();
  });
});
