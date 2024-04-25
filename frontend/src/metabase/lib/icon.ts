import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import type { IconName } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import type {
  CardDisplayType,
  Collection,
  SearchModel,
} from "metabase-types/api";

export type ObjectWithModel = {
  model: SearchModel;
  authority_level?: string;
  display?: CardDisplayType;
  type?: Collection["type"];
};

const modelIconMap: Record<SearchModel, IconName> = {
  collection: "folder",
  database: "database",
  table: "table",
  dataset: "model",
  action: "bolt",
  "indexed-entity": "index",
  dashboard: "dashboard",
  card: "table",
  segment: "segment",
  metric: "funnel",
  snippet: "snippet",
};

export type IconData = {
  name: IconName;
  color?: string;
};

/** get an Icon for any entity object, doesn't depend on the entity system */
export const getIconBase = (item: ObjectWithModel): IconData => {
  if (item.model === "card" && item.display) {
    return { name: getIconForVisualizationType(item.display) };
  }

  return { name: modelIconMap?.[item.model] ?? "unknown" };
};

export const getIcon = PLUGIN_COLLECTIONS.getIcon ?? getIconBase;
