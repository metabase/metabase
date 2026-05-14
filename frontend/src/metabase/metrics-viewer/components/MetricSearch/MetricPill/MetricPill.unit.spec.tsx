import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setupSearchEndpoints } from "__support__/server-mocks";
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
  setupSearchEndpoints([]);
  renderWithProviders(
    <MetricPill
      metric={metric}
      definitionEntry={definitionEntry ?? { id: "measure:1", definition: null }}
      onSwap={jest.fn()}
      onRemove={jest.fn()}
      onSetBreakout={jest.fn()}
    />,
  );
}

async function openMenu() {
  const pill = screen.getByTestId("metrics-viewer-search-pill");
  await userEvent.click(pill);
}

describe("MetricPill action menu", () => {
  it("should show only 'Replace' for a measure with no dimensions", async () => {
    setup({
      metric: { id: 1, name: "Revenue", sourceType: "measure" },
    });
    await openMenu();

    expect(screen.getByText("Replace")).toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.queryByText("Break out")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Go to metric home page"),
    ).not.toBeInTheDocument();
  });

  it("should show 'Replace' + 'Go to metric home page' for a metric without dimensions", async () => {
    setup({
      metric: { id: 1, name: "Revenue", sourceType: "metric" },
    });
    await openMenu();

    expect(screen.getByText("Replace")).toBeInTheDocument();
    expect(screen.getByText("Go to metric home page")).toBeInTheDocument();
    // No separator when there are no breakout items between them.
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("should show 'Replace', 'Break out', and 'Go to metric home page' with a separator when dimensions exist", async () => {
    const metadata = createMetricMetadata([REVENUE_METRIC]);
    const definition = setupDefinition(metadata, REVENUE_METRIC.id);

    setup({
      metric: { id: REVENUE_METRIC.id, name: "Revenue", sourceType: "metric" },
      definitionEntry: { id: "metric:1", definition },
    });
    await openMenu();

    expect(screen.getByText("Replace")).toBeInTheDocument();
    expect(screen.getByText("Break out")).toBeInTheDocument();
    expect(screen.getByText("Go to metric home page")).toBeInTheDocument();
    // One separator between breakout items and 'Go to metric home page'.
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });

  it("should open the MetricSearchDropdown when Replace is clicked", async () => {
    setup({
      metric: { id: 1, name: "Revenue", sourceType: "metric" },
    });
    await openMenu();
    await userEvent.click(screen.getByText("Replace"));

    expect(await screen.findByText("Browse all")).toBeInTheDocument();
  });
});
