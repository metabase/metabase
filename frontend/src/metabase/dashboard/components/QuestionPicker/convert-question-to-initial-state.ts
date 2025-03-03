import visualizations from "metabase/visualizations";
import {
  getInitialStateForCardDataSource,
  isVisualizerDashboardCard,
} from "metabase/visualizer/utils";
import type {
  Card,
  DatasetQuery,
  VisualizationDisplay,
} from "metabase-types/api";

export function convertCardToInitialState(card: Card<DatasetQuery>) {
  if (isVisualizerDashboardCard(card as any)) {
    return {
      state: {
        display: card.display,
        visualization_settings: card.visualization_settings,
      },
      extraDataSources: [`card:${card.id}` as const],
    };
  }

  const initialState = getInitialStateForCardDataSource(
    card,
    card.result_metadata,
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
