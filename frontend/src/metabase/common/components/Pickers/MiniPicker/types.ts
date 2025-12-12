import type {
  CollectionId,
  CollectionItem,
  DatabaseId,
  SchemaName,
  TableId,
} from "metabase-types/api";

export type MiniPickerCollectionItem = Pick<
  CollectionItem,
  "id" | "name" | "model" | "here" | "below" | "display" | "collection"
> & {
  id: CollectionItem["id"] | CollectionId;
};

export type MiniPickerPickableCollectionItem = MiniPickerCollectionItem & {
  // maz says this will never happen, but
  // if this is used outside the data picker, this should be generic
  model: Omit<
    CollectionItem["model"],
    "collection" | "dashboard" | "document" | "snippet" | "indexed-entity"
  >;
};

export type MiniPickerSchemaItem = {
  model: "schema";
  id: SchemaName;
  dbId: DatabaseId;
  name: SchemaName;
};

export type MiniPickerTableItem = {
  model: "table";
  id: TableId;
  db_id: DatabaseId;
  database_name?: string;
  table_schema?: string;
  name: string;
};

export const isTableItem = (
  item: MiniPickerItem,
): item is MiniPickerTableItem => {
  return item.model === "table";
};

export type MiniPickerDatabaseItem = {
  model: "database";
  id: DatabaseId;
  name: string;
};

export enum MiniPickerFolderModel {
  Database = "database",
  Schema = "schema",
  Collection = "collection",
}

// this includes all possible item types that can be shown in the mini picker
export type MiniPickerItem =
  | MiniPickerCollectionItem
  | MiniPickerSchemaItem
  | MiniPickerTableItem
  | MiniPickerDatabaseItem;

// this is only the intermediate/folder types that cannot ultimately be picked
export type MiniPickerFolderItem =
  | MiniPickerDatabaseItem
  | MiniPickerSchemaItem
  | (MiniPickerCollectionItem & { model: "collection" });

// this omits intermediate/folder types that cannot ultimately be picked
export type MiniPickerPickableItem =
  | MiniPickerPickableCollectionItem
  | MiniPickerTableItem;

// can't get schemas in search results
export type SearchableMiniPickerItem =
  | MiniPickerPickableCollectionItem
  | MiniPickerTableItem
  | MiniPickerDatabaseItem;
