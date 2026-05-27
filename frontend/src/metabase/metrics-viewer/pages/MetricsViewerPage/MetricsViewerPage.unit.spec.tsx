import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { UseMetricsViewerResult } from "metabase/metrics-viewer/hooks/use-metrics-viewer";
import type { MetricsViewerDimensionBreakoutState } from "metabase/metrics-viewer/types";
import type { AvailableDimensionsResult } from "metabase/metrics-viewer/utils";
import { createMockLocation } from "metabase/redux/store/mocks";

import { MetricsViewerPage } from "./MetricsViewerPage";

jest.mock("metabase/metrics-viewer/hooks", () => ({
  useMetricsViewer: jest.fn(),
}));

jest.mock("metabase/metrics-viewer/components/MetricSearchPanel", () => ({
  MetricSearchPanel: () => null,
}));

jest.mock(
  "metabase/metrics-viewer/components/MetricsViewerDimensionBreakoutContent",
  () => {
    const { useDimensionPickerSidebar } = jest.requireActual(
      "metabase/metrics-viewer/components/DimensionPickerSidebar",
    );

    return {
      MetricsViewerDimensionBreakoutContent: () => {
        const { open } = useDimensionPickerSidebar();

        return <button onClick={open}>Open sidebar</button>;
      },
    };
  },
);

const { useMetricsViewer } = jest.requireMock("metabase/metrics-viewer/hooks");

const SOURCE_ID = "metric:1";

const activeDimensionBreakout: MetricsViewerDimensionBreakoutState = {
  id: "dimensionBreakout-category",
  type: "category",
  label: "Category",
  display: "bar",
  dimensionMapping: { 0: "dim-category" },
  projectionConfig: {},
};

const activeDimensionBreakoutAvailableDimensions: AvailableDimensionsResult = {
  shared: [],
  bySource: {
    [SOURCE_ID]: [
      {
        icon: "label",
        dimensionBreakoutInfo: {
          type: "category",
          label: "Category",
          dimensionMapping: { 0: "dim-category" },
        },
      },
    ],
  },
};

const sidebarAvailableDimensions: AvailableDimensionsResult = {
  shared: [],
  bySource: {
    [SOURCE_ID]: [
      ...activeDimensionBreakoutAvailableDimensions.bySource[SOURCE_ID],
      {
        icon: "label",
        dimensionBreakoutInfo: {
          type: "category",
          label: "Address",
          dimensionMapping: { 0: "dim-address" },
        },
      },
    ],
  },
};

function setup() {
  useMetricsViewer.mockReturnValue({
    definitions: { [SOURCE_ID]: { id: SOURCE_ID, definition: null } },
    formulaEntities: [],
    dimensionBreakouts: [activeDimensionBreakout],
    activeDimensionBreakout,
    initialLoadComplete: true,
    loadingIds: new Set(),
    resultsByEntityIndex: new Map(),
    queriesAreLoading: false,
    queriesError: null,
    modifiedDefinitionsBySlotIndex: new Map(),
    breakoutValuesByEntityIndex: new Map(),
    metricSlots: [{ slotIndex: 0, entityIndex: 0, sourceId: SOURCE_ID }],
    series: [],
    cardIdToEntityIndex: {},
    activeBreakoutColors: {},
    sourceColors: {},
    selectedMetrics: [],
    sourceOrder: [SOURCE_ID],
    sourceDataById: { [SOURCE_ID]: { type: "metric", name: "Revenue" } },
    availableDimensions: sidebarAvailableDimensions,
    activeDimensionBreakoutAvailableDimensions,
    sidebarAvailableDimensions,
    addMetric: jest.fn(),
    swapMetric: jest.fn(),
    removeMetric: jest.fn(),
    selectDimensionBreakout: jest.fn(),
    updateActiveDimensionBreakout: jest.fn(),
    setBreakoutDimension: jest.fn(),
    setFormulaEntities: jest.fn(),
  } satisfies UseMetricsViewerResult);

  renderWithProviders(
    <MetricsViewerPage
      location={createMockLocation({ pathname: "/explore" })}
    />,
  );
}

describe("MetricsViewerPage", () => {
  beforeEach(() => {
    useMetricsViewer.mockReset();
  });

  it("keeps all sidebar fields visible in the See all view", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Open sidebar" }));
    await userEvent.click(screen.getByRole("button", { name: "See all" }));

    expect(screen.getByText("All fields")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Address" })).toBeInTheDocument();
  });
});
