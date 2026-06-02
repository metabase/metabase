import type { UseMetricsViewerResult } from "metabase/metrics-viewer/hooks/use-metrics-viewer";

const EMPTY_AVAILABLE_DIMENSIONS = { shared: [], bySource: {} };

export function createMockMetricsViewerResult(
  overrides: Partial<UseMetricsViewerResult> = {},
): UseMetricsViewerResult {
  return {
    definitions: {},
    formulaEntities: [],
    dimensionBreakouts: [],
    activeDimensionBreakout: null,
    initialLoadComplete: true,
    loadingIds: new Set(),
    resultsByEntityIndex: new Map(),
    queriesAreLoading: false,
    queriesError: null,
    modifiedDefinitionsBySlotIndex: new Map(),
    breakoutValuesByEntityIndex: new Map(),
    metricSlots: [],
    series: [],
    cardIdToEntityIndex: {},
    activeBreakoutColors: {},
    sourceColors: {},
    selectedMetrics: [],
    sourceOrder: [],
    sourceDataById: {},
    availableDimensions: EMPTY_AVAILABLE_DIMENSIONS,
    activeDimensionBreakoutAvailableDimensions: EMPTY_AVAILABLE_DIMENSIONS,
    sidebarAvailableDimensions: EMPTY_AVAILABLE_DIMENSIONS,
    addMetric: jest.fn(),
    swapMetric: jest.fn(),
    removeMetric: jest.fn(),
    selectDimensionBreakout: jest.fn(),
    updateActiveDimensionBreakout: jest.fn(),
    setBreakoutDimension: jest.fn(),
    setFormulaEntities: jest.fn(),
    ...overrides,
  };
}
