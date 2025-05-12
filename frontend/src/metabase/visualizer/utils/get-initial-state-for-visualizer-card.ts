import type {
  Dataset,
  VisualizerDashboardCard,
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/api";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import { createDataSource } from "./data-source";
import { getVisualizationColumns } from "./get-visualization-columns";

export function getInitialStateForVisualizerCard(
  dashcard: VisualizerDashboardCard,
  datasets: Record<number, Dataset | null | undefined>,
): {
  visualizationEntityWithColumns: VisualizerVizDefinitionWithColumns;
  dataSources: VisualizerDataSource[];
  dataSourceDatasets: Record<`card:${string}`, Dataset | null | undefined>;
} {
  const visualizationEntity = dashcard.visualization_settings?.visualization;

  const cards = [dashcard.card];
  if (Array.isArray(dashcard.series)) {
    cards.push(...dashcard.series);
  }

  const dataSources = cards.map((card) =>
    createDataSource("card", card.entity_id, card.name),
  );

  const dataSourceDatasets: Record<
    VisualizerDataSourceId,
    Dataset | null | undefined
  > = Object.fromEntries(
    Object.entries(datasets ?? {}).map(([cardId, dataset]) => {
      const card = cards.find((card) => card.id === Number(cardId));
      return [`card:${card?.entity_id}`, dataset];
    }),
  );

  const columns = getVisualizationColumns(
    visualizationEntity,
    dataSourceDatasets,
    dataSources,
  );

  return {
    visualizationEntityWithColumns: { ...visualizationEntity, columns },
    dataSources,
    dataSourceDatasets,
  };
}
