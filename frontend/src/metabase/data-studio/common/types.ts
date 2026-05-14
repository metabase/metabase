import type { IconName } from "metabase/ui";
import type {
  Collection,
  CollectionItem,
  CollectionItemModel,
  Table,
} from "metabase-types/api";

export type LibrarySectionType = "data" | "metrics" | "snippets";

export type EmptyStateData = {
  model: "empty-state";
  sectionType: LibrarySectionType;
  description: string;
  actionLabel: string;
  actionUrl?: string;
};

export type CollectionItemData = Pick<CollectionItem, "model" | "name"> &
  Partial<
    Pick<
      CollectionItem,
      | "id"
      | "description"
      | "collection_id"
      | "archived"
      | "collection_position"
      | "last-edit-info"
      | "namespace"
    >
  >;

export type CollectionData = Collection & {
  model: "collection";
};

export type TableData = Table & {
  model: "table";
};

export type TreeItemModel = CollectionItemModel | "empty-state";

export type TreeItem = {
  id: string;
  name: string;
  icon: IconName;
  updatedAt?: string;
  model: TreeItemModel;
  parentCollectionName?: string;
  data: CollectionItemData | CollectionData | TableData | EmptyStateData;
  children?: TreeItem[];
  childrenLoaded?: boolean;
};
