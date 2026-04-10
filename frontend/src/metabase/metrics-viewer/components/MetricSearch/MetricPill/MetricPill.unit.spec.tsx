import { fireEvent, screen } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";

import type {
  MetricsViewerDefinitionEntry,
  SelectedMetric,
} from "../../../types/viewer-state";
import {
  REVENUE_METRIC,
  createMetricMetadata,
  setupDefinition,
} from "../../../utils/__tests__/test-helpers";

import { MetricPill } from "./MetricPill";

function setup({
  metric,
  definitionEntry,
}: {
  metric: SelectedMetric;
  definitionEntry?: MetricsViewerDefinitionEntry;
}) {
  renderWithProviders(
    <MetricPill
      metric={metric}
      definitionEntry={definitionEntry ?? { id: "measure:1", definition: null }}
      selectedMetricIds={new Set()}
      selectedMeasureIds={new Set()}
      onSwap={jest.fn()}
      onRemove={jest.fn()}
      onSetBreakout={jest.fn()}
    />,
  );
}

function openContextMenu() {
  const pill = screen.getByTestId("metrics-viewer-search-pill");
  fireEvent.contextMenu(pill);
}

describe("MetricPill context menu", () => {
  it("should not show bottom menu items for a measure", () => {
    setup({
      metric: { id: 1, name: "Revenue", sourceType: "measure" },
    });
    openContextMenu();

    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Go to metric home page"),
    ).not.toBeInTheDocument();
  });

  it("should show 'Go to metric home page' without separator when no breakout items", () => {
    setup({
      metric: { id: 1, name: "Revenue", sourceType: "metric" },
    });
    openContextMenu();

    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.getByText("Go to metric home page")).toBeInTheDocument();
  });

  it("should show separator between breakout items and 'Go to metric home page'", () => {
    const metadata = createMetricMetadata([REVENUE_METRIC]);
    const definition = setupDefinition(metadata, REVENUE_METRIC.id);

    setup({
      metric: { id: REVENUE_METRIC.id, name: "Revenue", sourceType: "metric" },
      definitionEntry: { id: "metric:1", definition },
    });
    openContextMenu();

    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getByText("Break out")).toBeInTheDocument();
    expect(screen.getByText("Go to metric home page")).toBeInTheDocument();
  });
});
