import type { Card, VisualizationSettings } from "metabase-types/api";

export function createSeriesCard(
  id: number,
  name: string | null,
  display: string,
  vizSettings: VisualizationSettings,
): Card {
  return {
    id,
    name,
    display,
    visualization_settings: vizSettings,
  } as Card;
}
