import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import type { IconName } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import type {
  CardDisplayType,
  Collection,
  CollectionItemModel,
  SearchModel,
} from "metabase-types/api";

type IconModel = SearchModel | CollectionItemModel | "schema";

export type ObjectWithModel = {
  id?: unknown;
  model: IconModel;
  authority_level?: "official" | string | null;
  collection_authority_level?: "official" | string | null;
  moderated_status?: "verified" | string | null;
  display?: CardDisplayType | null;
  type?: Collection["type"];
  is_personal?: boolean;
};

const modelIconMap: Record<IconModel, IconName> = {
  collection: "folder",
  database: "database",
  table: "table",
  dataset: "model",
  schema: "folder",
  action: "bolt",
  "indexed-entity": "index",
  dashboard: "dashboard",
  card: "table",
  segment: "segment",
  metric: "metric",
  snippet: "unknown",
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

  if (item.model === "collection" && item.id === PERSONAL_COLLECTIONS.id) {
    return { name: "group" };
  }

  if (item.model === "collection" && item.is_personal) {
    return { name: "person" };
  }

  return { name: modelIconMap?.[item.model] ?? "unknown" };
};

export const getIcon = (item: ObjectWithModel) => {
  if (PLUGIN_COLLECTIONS) {
    return PLUGIN_COLLECTIONS.getIcon(item);
  }
  return getIconBase(item);
};
