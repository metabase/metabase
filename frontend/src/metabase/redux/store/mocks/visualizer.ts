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
  loadingDataSources: {},
  loadingDatasets: {},
  error: null,
  draggedItem: null,
  hoveredItems: null,
  ...opts,
});
