import { b64_to_utf8 } from "metabase/utils/encoding";
import type { SeriesCard, VisualizationSettings } from "metabase-types/api";

export const MCP_APP_VISUALIZATION_SETTINGS: VisualizationSettings = {
  "graph.x_axis.labels_enabled": false,
  "graph.y_axis.labels_enabled": false,
};

export function getMcpDeserializedCard(query: string): SeriesCard | null {
  try {
    return {
      display: "table",
      dataset_query: JSON.parse(b64_to_utf8(query)),
      visualization_settings: MCP_APP_VISUALIZATION_SETTINGS,
    };
  } catch {
    return null;
  }
}
