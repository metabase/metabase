import type {
  CollectionId,
  CollectionItem,
  DatabaseId,
  SchemaName,
  TableId,
} from "metabase-types/api";

export type OmniPickerCollectionItem = Pick<
  CollectionItem,
  "id" | "name" | "model" | "here" | "below" | "moderated_status"
> & {
  id: CollectionItem["id"] | CollectionId;
};

export type OmniPickerPickableItem<PickableModels extends CollectionItem["model"]> = OmniPickerItem & {
  model: PickableModels;
};

export type OmniPickerSchemaItem = {
  model: "schema";
  id: SchemaName;
  dbId: DatabaseId;
  name: SchemaName;
};

export type OmniPickerTableItem = {
  model: "table";
  id: TableId;
  db_id: DatabaseId;
  name: string;
};

export type OmniPickerDatabaseItem = {
  model: "database";
  id: DatabaseId;
  name: string;
};

export enum OmniPickerFolderModel {
  Database = "database",
  Schema = "schema",
  Collection = "collection",
}

export type DbTreeItem = OmniPickerDatabaseItem | OmniPickerSchemaItem | OmniPickerTableItem;

export const isInDbTree = (
  item: OmniPickerItem,
): item is DbTreeItem => {
  return (
    item.model === "database" ||
    item.model === "schema" ||
    item.model === "table"
  );
};

// this includes all possible item types that can be shown in the mini picker
export type OmniPickerItem =
  | OmniPickerCollectionItem
  | OmniPickerSchemaItem
  | OmniPickerTableItem
  | OmniPickerDatabaseItem;

// this is only the intermediate/folder types that cannot ultimately be picked
export type OmniPickerFolderItem =
  | OmniPickerDatabaseItem
  | OmniPickerSchemaItem
  | (OmniPickerCollectionItem & { model: "collection" });

// can't get schemas in search results
export type SearchableOmniPickerItem =
  | OmniPickerCollectionItem
  | OmniPickerTableItem
  | OmniPickerDatabaseItem;
