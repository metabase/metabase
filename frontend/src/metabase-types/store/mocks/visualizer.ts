import type { VisualizerState, VisualizerUiState } from "../visualizer";

export const createMockVisualizerState = (
  opts?: Partial<VisualizerState>,
): VisualizerState => ({
  initialState: {
    display: null,
    columns: [],
    columnValuesMapping: {},
    settings: {},
  },
  display: null,
  columns: [],
  columnValuesMapping: {},
  settings: {},
  cards: [],
  datasets: {},
  loadingDataSources: {},
  loadingDatasets: {},
  error: null,
  draggedItem: null,
  ...opts,
});

export const createMockVisualizerUiState = (
  opts?: Partial<VisualizerUiState>,
): VisualizerUiState => ({
  expandedDataSources: {},
  isDataSidebarOpen: true,
  isVizSettingsSidebarOpen: false,
  isSwapAffordanceVisible: false,
  ...opts,
});
