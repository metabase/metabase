import {
  DEFAULT_VISUALIZER_DISPLAY,
  getInitialStateForCardDataSource,
  isVisualizerSupportedVisualization,
} from "metabase/visualizer/utils";
import type { Card, DatasetColumn } from "metabase-types/api";
import type {
  VisualizerDataSourceId,
  VisualizerHistoryItem,
} from "metabase-types/store/visualizer";

export function convertCardToInitialState(card: Card): {
  state: Partial<VisualizerHistoryItem>;
  extraDataSources: [VisualizerDataSourceId];
} {
  const initialState = getInitialStateForCardDataSource(
    card,
    // TODO fix that
    card.result_metadata as unknown as DatasetColumn[],
  );

  // if the visualization doesn't support the visualizer, default to bar chart
  if (!isVisualizerSupportedVisualization(initialState.display)) {
    return {
      state: {
        ...initialState,
        display: DEFAULT_VISUALIZER_DISPLAY,
      },
      extraDataSources: [`card:${card.id}` as const],
    };
  }

  return {
    state: initialState,
    extraDataSources: [`card:${card.id}` as const],
  };
}
