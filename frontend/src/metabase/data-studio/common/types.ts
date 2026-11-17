import type {
  Collection,
  CollectionItem,
  CollectionItemModel,
  DatabaseId,
  IconName,
  SchemaName,
  Table,
  TableId,
} from "metabase-types/api";

export type LibrarySectionType = "data" | "metrics" | "snippets" | "actions";

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
      | "can_write"
      | "here"
      | "below"
    >
  >;

export type CollectionData = Collection & {
  model: "collection";
};

export type TableData = Table & {
  model: "table";
};

/** A segment or measure leaf, grouped under its published table */
export type SegmentMeasureData = {
  id: number;
  name: string;
  model: "segment" | "measure";
  table_id: TableId;
  databaseId: DatabaseId;
  schemaName: SchemaName;
};

export type TreeItemModel =
  | CollectionItemModel
  | "empty-state"
  | "segment"
  | "measure";

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
