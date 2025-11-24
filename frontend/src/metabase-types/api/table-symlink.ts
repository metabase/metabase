import type { Collection, CollectionId } from "./collection";
import type { DatabaseId } from "./database";
import type { SchemaId, Table, TableId } from "./table";

export type TableSymlinkId = number;

export type TableSymlink = {
  id: TableSymlinkId;
  database_id: DatabaseId;
  table_id: TableId;
  collection_id: CollectionId | null;

  // hydrated
  table?: Table | null;
  collection?: Collection | null;
};

export type NormalizedTableSymlink = Omit<
  TableSymlink,
  "table" | "collection"
> & {
  table?: TableId | null;
  collection?: CollectionId | null;
};

export type ListTableSymlinksRequest = {
  table_id: TableId;
};

export type CreateTableSymlinkRequest = {
  collection_id: CollectionId | null;
  database_ids?: DatabaseId[];
  schema_ids?: SchemaId[];
  table_ids?: TableId[];
};
