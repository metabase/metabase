import type { IconName } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors";
import type {
  CardType,
  Collection,
  CollectionItemModel,
  CollectionType,
  SearchModel,
  VisualizationDisplay,
} from "metabase-types/api";

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
  iconUrl?: string;
};
