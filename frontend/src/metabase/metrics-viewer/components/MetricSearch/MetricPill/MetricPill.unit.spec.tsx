import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setupSearchEndpoints } from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import type {
  MetricsViewerDefinitionEntry,
  SelectedMetric,
} from "metabase/metrics-viewer/types";
import {
  REVENUE_METRIC,
  createMetricMetadata,
  setupDefinition,
} from "metabase/metrics-viewer/utils/__tests__/test-helpers";

import { MetricPill } from "./MetricPill";

function setup({
  metric,
  definitionEntry,
  isDisabled,
  onRemove = jest.fn(),
}: {
  metric: SelectedMetric;
  definitionEntry?: MetricsViewerDefinitionEntry;
  isDisabled?: boolean;
  onRemove?: jest.Mock;
}) {
  setupSearchEndpoints([]);
  renderWithProviders(
    <MetricPill
      metric={metric}
      definitionEntry={definitionEntry ?? { id: "measure:1", definition: null }}
      isDisabled={isDisabled}
      onSwap={jest.fn()}
      onRemove={onRemove}
      onSetBreakout={jest.fn()}
    />,
  );

  return { onRemove };
}

async function openPillMenu() {
  const pill = screen.getByTestId("metrics-viewer-pill");
  await userEvent.click(pill);
}

describe("MetricPill action menu", () => {
  it("should show only 'Replace' for a measure with no dimensions", async () => {
    setup({
      metric: { id: 1, name: "Revenue", sourceType: "measure" },
    });
    await openPillMenu();

    expect(screen.getByText("Replace")).toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.queryByText("Add a series breakout")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Go to metric home page"),
    ).not.toBeInTheDocument();
  });

  it("should show 'Replace' + 'Go to metric home page' for a metric without dimensions", async () => {
    setup({
      metric: { id: 1, name: "Revenue", sourceType: "metric" },
    });
    await openPillMenu();

    expect(screen.getByText("Replace")).toBeInTheDocument();
    expect(screen.getByText("Go to metric home page")).toBeInTheDocument();
    expect(screen.getByLabelText("home icon")).toBeInTheDocument();
    expect(screen.queryByLabelText("external icon")).not.toBeInTheDocument();
    // No separator when there are no breakout items between them.
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("should show 'Replace', 'Add a series breakout', and 'Go to metric home page' when dimensions exist", async () => {
    const metadata = createMetricMetadata([REVENUE_METRIC]);
    const definition = setupDefinition(metadata, REVENUE_METRIC.id);

    setup({
      metric: { id: REVENUE_METRIC.id, name: "Revenue", sourceType: "metric" },
      definitionEntry: { id: "metric:1", definition },
    });
    await openPillMenu();

    expect(screen.getByText("Replace")).toBeInTheDocument();
    expect(screen.getByText("Add a series breakout")).toBeInTheDocument();
    expect(screen.getByText("Go to metric home page")).toBeInTheDocument();
  });

  it("should open the MetricSearchDropdown when Replace is clicked", async () => {
    setup({
      metric: { id: 1, name: "Revenue", sourceType: "metric" },
    });
    await openPillMenu();
    await userEvent.click(screen.getByText("Replace"));

    expect(await screen.findByText("Browse all")).toBeInTheDocument();
  });

  it("should keep pill actions available when visually disabled", async () => {
    const onRemove = jest.fn();
    setup({
      metric: { id: 1, name: "Revenue", sourceType: "metric" },
      isDisabled: true,
      onRemove,
    });

    await openPillMenu();

    expect(screen.getByText("Replace")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Remove Revenue"));

    expect(onRemove).toHaveBeenCalledWith(1, "metric");
  });
});
