import type { CollectionItem } from "metabase/common/components/DataPicker";

export type CollectionListItem = CollectionItem & {
  position: number | null;
};
