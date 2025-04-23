import type { VisualizerState } from "../visualizer";

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
  expandedDataSources: {},
  loadingDataSources: {},
  loadingDatasets: {},
  isDataSidebarOpen: true,
  isVizSettingsSidebarOpen: false,
  isSwapAffordanceVisible: false,
  error: null,
  draggedItem: null,
  ...opts,
});
