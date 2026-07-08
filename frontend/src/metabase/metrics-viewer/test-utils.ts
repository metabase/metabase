import type { UseViewerStateResult } from "metabase/metrics-viewer/types";

const EMPTY_AVAILABLE_DIMENSIONS = { shared: [], bySource: {} };

export function createMockMetricsViewerResult(
  overrides: Partial<UseViewerStateResult> = {},
): UseViewerStateResult {
  return {
    definitions: {},
    formulaEntities: [],
    activeDimensionBreakout: null,
    initialLoadComplete: true,
    queriesAreLoading: false,
    queriesError: null,
    modifiedDefinitionsBySlotIndex: new Map(),
    metricSlots: [],
    series: [],
    cardIdToEntityIndex: {},
    activeBreakoutColors: {},
    sourceColors: {},
    selectedMetrics: [],
    sourceOrder: [],
    sourceDataById: {},
    availableDimensions: EMPTY_AVAILABLE_DIMENSIONS,
    sidebarAvailableDimensions: EMPTY_AVAILABLE_DIMENSIONS,
    showColumnLabels: false,
    isSidebarOpen: true,
    closeSidebar: jest.fn(),
    openSidebar: jest.fn(),
    addMetric: jest.fn(),
    swapMetric: jest.fn(),
    removeMetric: jest.fn(),
    selectDimensionBreakout: jest.fn(),
    updateActiveDimensionBreakout: jest.fn(),
    setShowColumnLabels: jest.fn(),
    setBreakoutDimension: jest.fn(),
    setFormulaEntities: jest.fn(),
    ...overrides,
  };
}
