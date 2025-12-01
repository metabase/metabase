import type { IconName } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";

export type ModelingItem = CollectionItem & {
  model: "metric" | "model";
};

export type SortColumn = "name" | "description";

export interface ItemIcon {
  name: IconName;
  color?: string;
}
