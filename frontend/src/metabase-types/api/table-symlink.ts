import type { CollectionId } from "./collection";
import type { TableId } from "./table";

export type TableSymlink = {
  table_id: TableId;
  collection_id: CollectionId | null;
};

export type CreateTableSymlinkRequest = {
  table_id: TableId;
  collection_id: CollectionId | null;
};
