import type {
  Collection,
  CollectionItem,
  CollectionItemModel,
  IconName,
  Table,
} from "metabase-types/api";

export type LibrarySectionType = "data" | "metrics" | "snippets" | "seeds";

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

export type SeedData = {
  model: "seed";
  id: number;
  name: string;
  // "git" seeds are authored in the repo and read-only here; "upload" seeds are user-owned.
  origin: "git" | "upload";
  tableId: number | null;
  syncError: string | null;
};

export type TreeItemModel = CollectionItemModel | "empty-state" | "seed";

export type TreeItem = {
  id: string;
  name: string;
  icon: IconName;
  updatedAt?: string;
  model: TreeItemModel;
  parentCollectionName?: string;
  data:
    | CollectionItemData
    | CollectionData
    | TableData
    | EmptyStateData
    | SeedData;
  children?: TreeItem[];
  childrenLoaded?: boolean;
};
