import type {
  CollectionId,
  CollectionItem,
  DatabaseId,
  SchemaName,
  TableId,
} from "metabase-types/api";
import { DataPickerValue } from "../Pickers/DataPicker";
import { CollectionPickerValueItem } from "../Pickers/CollectionPicker";

export type OmniPickerCollectionItem = Pick<
  CollectionItem,
  "name" | "model" | "here" | "below" | "moderated_status" | "display"
> & {
  id: CollectionItem["id"] | CollectionId;
  model: "collection";
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

// this is only the intermediate/folder types
export type OmniPickerFolderItem =
  | OmniPickerDatabaseItem
  | OmniPickerSchemaItem
  | OmniPickerCollectionItem;

// can't get schemas in search results
export type SearchableOmniPickerItem =
  | OmniPickerCollectionItem
  | OmniPickerTableItem
  | OmniPickerDatabaseItem;

export type OmniPickerValue = DataPickerValue | {
  id: CollectionId;
  model: "collection",
} | {
  id: SchemaName;
  model: "schema";
};
