import type {
  Dataset,
  VisualizerDashboardCard,
  VisualizerDataSourceId,
} from "metabase-types/api";

import { createDataSource } from "./data-source";
import { getVisualizationColumns } from "./get-visualization-columns";

export function getInitialStateForVisualizerCard(
  dashcard: VisualizerDashboardCard,
  datasets: Record<number, Dataset | null | undefined>,
) {
  const visualizationEntity = dashcard.visualization_settings?.visualization;

  const cards = [dashcard.card];
  if (Array.isArray(dashcard.series)) {
    cards.push(...dashcard.series);
  }

  const dataSources = cards.map((card) =>
    createDataSource("card", card.id, card.name),
  );

  const dataSourceDatasets: Record<
    VisualizerDataSourceId,
    Dataset | null | undefined
  > = Object.fromEntries(
    Object.entries(datasets ?? {}).map(([cardId, dataset]) => [
      `card:${cardId}`,
      dataset,
    ]),
  );

  const columns = getVisualizationColumns(
    visualizationEntity,
    dataSourceDatasets,
    dataSources,
  );

  return { ...visualizationEntity, columns, datasetFallbacks: datasets };
}
