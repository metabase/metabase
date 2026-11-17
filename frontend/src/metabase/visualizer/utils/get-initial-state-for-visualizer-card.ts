import type {
  Dataset,
  VisualizerDashboardCard,
  VisualizerDataSourceId,
} from "metabase-types/api";

import { createDataSource } from "./data-source";
import { getVisualizationColumns } from "./get-visualization-columns";

export function getInitialStateForVisualizerCard(
  dashcard: VisualizerDashboardCard,
  preloadedDatasets: Record<number, Dataset | null | undefined>,
) {
  const visualizationEntity = dashcard.visualization_settings?.visualization;

  const cards = [dashcard.card];
  if (Array.isArray(dashcard.series)) {
    cards.push(...dashcard.series);
  }

  const dataSources = cards.map((card) =>
    createDataSource("card", card.id, card.name),
  );

  // the dashboard's dataset cache may still hold cards removed from this dashcard
  const dashcardDatasets: Record<number, Dataset | null | undefined> =
    Object.fromEntries(
      cards.map((card) => [card.id, preloadedDatasets?.[card.id]]),
    );

  const dataSourceDatasets: Record<
    VisualizerDataSourceId,
    Dataset | null | undefined
  > = Object.fromEntries(
    Object.entries(dashcardDatasets).map(([cardId, dataset]) => [
      `card:${cardId}`,
      dataset,
    ]),
  );

  const columns = getVisualizationColumns(
    visualizationEntity,
    dataSourceDatasets,
    dataSources,
  );

  return {
    ...visualizationEntity,
    columns,
    preloadedDatasets: dashcardDatasets,
  };
}
