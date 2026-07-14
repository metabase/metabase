import type {
  Card,
  DatasetQuery,
  VisualizationSettings,
} from "metabase-types/api";

export function createSeriesCard(
  id: number,
  name: string | null,
  display: string,
  vizSettings: VisualizationSettings,
  datasetQuery?: DatasetQuery,
): Card {
  // Unjustified type cast. FIXME
  return {
    id,
    name,
    display,
    visualization_settings: vizSettings,
    dataset_query: datasetQuery,
  } as Card;
}
