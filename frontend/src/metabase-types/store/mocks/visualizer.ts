import type { VisualizerState } from "../visualizer";

export const createMockVisualizerState = (
  opts?: Partial<VisualizerState>,
): VisualizerState => ({
  initialState: {
    display: null,
    columns: [],
    columnValuesMapping: {},
    settings: {
      "card.title": "Card Title",
    },
  },
  display: null,
  columns: [],
  columnValuesMapping: {},
  settings: {
    "card.title": "Card Title",
  },
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
