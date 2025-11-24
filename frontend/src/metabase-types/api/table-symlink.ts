import type { Collection, CollectionId } from "./collection";
import type { TableId } from "./table";

export type TableSymlink = {
  table_id: TableId;
  collection_id: CollectionId | null;

  // hydrated
  collection?: Collection | null;
};

export type ListTableSymlinksRequest = {
  table_id: TableId;
};

export type CreateTableSymlinkRequest = {
  table_id: TableId;
  collection_id: CollectionId | null;
};
