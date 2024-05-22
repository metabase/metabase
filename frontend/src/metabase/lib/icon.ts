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
  authority_level?: "official" | string | null;
  collection_authority_level?: "official" | string | null;
  moderated_status?: "verified" | string | null;
  display?: CardDisplayType | null;
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
  metric: "metric",
};

const secondaryModelIconMap: Partial<Record<SearchModel, IconName>> = {
  table: "database",
};

export type IconData = {
  name: IconName;
  color?: string;
};

export type IconOptions = {
  variant?: "primary" | "secondary";
};

/** get an Icon for any entity object, doesn't depend on the entity system */
export const getIconBase = (
  item: ObjectWithModel,
  options: IconOptions = {},
): IconData => {
  if (item.model === "card" && item.display) {
    return { name: getIconForVisualizationType(item.display) };
  }

  if (options.variant === "secondary" && item.model in secondaryModelIconMap) {
    return { name: secondaryModelIconMap[item.model] ?? "unknown" };
  }

  return { name: modelIconMap?.[item.model] ?? "unknown" };
};

export const getIcon = (item: ObjectWithModel, options: IconOptions = {}) => {
  if (PLUGIN_COLLECTIONS) {
    return PLUGIN_COLLECTIONS.getIcon(item, options);
  }
  return getIconBase(item, options);
};
