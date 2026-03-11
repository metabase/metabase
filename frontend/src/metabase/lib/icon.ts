import { getLibraryCollectionType } from "metabase/data-studio/utils";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import type { IconName } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import type {
  CardType,
  Collection,
  CollectionItemModel,
  CollectionType,
  SearchModel,
  VisualizationDisplay,
} from "metabase-types/api";

import type { ColorName } from "./colors/types";

export type IconModel =
  | SearchModel
  | CollectionItemModel
  | "model"
  | "schema"
  | "timeline"
  | "question"
  | "transform"
  | "user"
  | "nativequerysnippet"
  | "pythonlibrary";

export type ObjectWithModel = {
  id?: unknown;
  model: IconModel;
  authority_level?: "official" | string | null;
  collection_authority_level?: "official" | string | null;
  moderated_status?: "verified" | string | null;
  display?: VisualizationDisplay | null;
  type?: CollectionType | CardType;
  collection_type?: CollectionType;
  location?: Collection["location"];
  effective_location?: Collection["location"];
  is_personal?: boolean;
  is_remote_synced?: boolean;
};

export const modelIconMap: Record<IconModel, IconName> = {
  collection: "folder",
  database: "database",
  table: "table",
  dataset: "model",
  schema: "folder_database",
  action: "bolt",
  "indexed-entity": "index",
  dashboard: "dashboard",
  question: "table2",
  model: "model",
  card: "table2",
  segment: "segment",
  measure: "ruler",
  metric: "metric",
  snippet: "snippet",
  nativequerysnippet: "snippet",
  document: "document",
  timeline: "calendar",
  transform: "transform",
  user: "person",
  pythonlibrary: "code_block",
};

export type IconData = {
  name: IconName;
  color?: ColorName;
};

/** get an Icon for any entity object, doesn't depend on the entity system */
export const getIconBase = (item: ObjectWithModel): IconData => {
  if (item.model === "card" && item.display) {
    return { name: getIconForVisualizationType(item.display) };
  }

  if (item.model === "collection" && item.id === PERSONAL_COLLECTIONS.id) {
    return { name: "group" };
  }

  if (
    item.model === "collection" &&
    item.is_personal &&
    item.location === "/"
  ) {
    return { name: "person" };
  }

  if (item.model === "collection" && item.id === "databases") {
    return { name: "database" };
  }

  if (item.model === "collection") {
    switch (getLibraryCollectionType(item.type as CollectionType)) {
      case "root":
        return { name: "repository" };
      case "data":
        return { name: "table" };
      case "metrics":
        return { name: "metric" };
    }
  }

  return { name: modelIconMap?.[item.model] ?? "unknown" };
};
/**
 * relies mainly on the `model` property to determine the icon to return
 * also handle special collection icons and visualization types for cards
 */
export const getIcon = (
  item: ObjectWithModel,
  { isTenantUser = false }: { isTenantUser?: boolean } = {},
): IconData => {
  if (PLUGIN_COLLECTIONS) {
    return PLUGIN_COLLECTIONS.getIcon(item, { isTenantUser });
  }
  return getIconBase(item);
};
