import visualizations from "metabase/visualizations";
import {
  getInitialStateForCardDataSource,
  isVisualizerDashboardCard,
} from "metabase/visualizer/utils";
import type {
  Card,
  DatasetColumn,
  VisualizationDisplay,
} from "metabase-types/api";
import type {
  VisualizerDataSourceId,
  VisualizerHistoryItem,
} from "metabase-types/store/visualizer";

export function convertCardToInitialState(card: Card): {
  state: Partial<VisualizerHistoryItem>;
  extraDataSources: [VisualizerDataSourceId];
} {
  if (isVisualizerDashboardCard(card)) {
    return {
      state: {},
      extraDataSources: [`card:${card.id}` as const],
    };
  }

  const initialState = getInitialStateForCardDataSource(
    card,
    // TODO fix that
    card.result_metadata as unknown as DatasetColumn[],
  );

  // if the visualization doesn't support the visualizer, default to bar chart
  if (!visualizations.get(initialState.display!)?.supportsVisualizer) {
    return {
      state: {
        ...initialState,
        display: "bar" as VisualizationDisplay,
      },
      extraDataSources: [`card:${card.id}` as const],
    };
  }

  return {
    state: initialState,
    extraDataSources: [`card:${card.id}` as const],
  };
}
