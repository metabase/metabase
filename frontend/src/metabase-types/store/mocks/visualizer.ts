import type { VisualizerHistoryItem, VisualizerState } from "../visualizer";

export const createMockVisualizerHistoryItem = (
  opts?: Partial<VisualizerHistoryItem>,
): VisualizerHistoryItem => ({
  display: null,
  columns: [],
  columnValuesMapping: {},
  settings: {
    "card.title": "Card Title",
  },
  ...opts,
});

export const createMockVisualizerState = (
  opts?: Partial<VisualizerState>,
): VisualizerState => ({
  initialState: createMockVisualizerHistoryItem(),
  past: [],
  present: createMockVisualizerHistoryItem(),
  future: [],
  cards: [],
  datasets: {},
  expandedDataSources: {},
  loadingDataSources: {},
  loadingDatasets: {},
  isDataSidebarOpen: true,
  isVizSettingsSidebarOpen: false,
  error: null,
  draggedItem: null,
  ...opts,
});
