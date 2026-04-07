import { fireEvent, screen } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type {
  MetricsViewerDefinitionEntry,
  SelectedMetric,
} from "../../../types/viewer-state";

import { MetricPill } from "./MetricPill";

const defaultDefinitionEntry: MetricsViewerDefinitionEntry = {
  id: "measure:1",
  definition: null,
};

function setup({
  metric,
  hasDataStudioAccess = false,
}: {
  metric: SelectedMetric;
  hasDataStudioAccess?: boolean;
}) {
  const state = createMockState({
    currentUser: createMockUser({
      is_superuser: hasDataStudioAccess,
    }),
  });

  renderWithProviders(
    <MetricPill
      metric={metric}
      definitionEntry={defaultDefinitionEntry}
      selectedMetricIds={new Set()}
      selectedMeasureIds={new Set()}
      onSwap={jest.fn()}
      onRemove={jest.fn()}
      onSetBreakout={jest.fn()}
    />,
    { storeInitialState: state },
  );
}

function openContextMenu() {
  const pill = screen.getByTestId("metrics-viewer-search-pill");
  fireEvent.contextMenu(pill);
}

describe("MetricPill context menu", () => {
  it("should not show bottom menu items for a measure without data studio access", () => {
    setup({
      metric: { id: 1, name: "Revenue", sourceType: "measure" },
    });
    openContextMenu();

    expect(screen.queryByRole("separatar")).not.toBeInTheDocument();

    expect(screen.queryByText("Edit in Data Studio")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Go to metric home page"),
    ).not.toBeInTheDocument();
  });

  it("should show 'Go to metric home page' for metric source type", () => {
    setup({
      metric: { id: 1, name: "Revenue", sourceType: "metric" },
    });
    openContextMenu();

    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getByText("Go to metric home page")).toBeInTheDocument();
  });

  it("should show 'Edit in Data Studio' when user has data studio access", () => {
    setup({
      metric: { id: 1, name: "Revenue", sourceType: "measure" },
      hasDataStudioAccess: true,
    });
    openContextMenu();
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getByText("Edit in Data Studio")).toBeInTheDocument();
  });
});
