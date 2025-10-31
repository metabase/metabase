import type { DatabaseId, SchemaName, TableId } from "metabase-types/api";

export type DatabaseItem = {
  id: DatabaseId;
  name: string;
  model: "database";
};

export type SchemaItem = {
  id: SchemaName;
  dbId: DatabaseId;
  dbName: string | undefined;
  isOnlySchema: boolean;
  name: string;
  model: "schema";
};

export type TableItem = {
  id: TableId;
  name: string;
  model: "table";
  database_id?: DatabaseId;
};

export type TablePickerValue = {
  id: TableId;
  name: string;
  model: "table";
  db_id: DatabaseId;
  schema: SchemaName;
};

export type TablePickerStatePath = [
  DatabaseId | undefined,
  SchemaName | undefined,
  TableId | undefined,
];

export type TablePickerValueItem = TableItem;

export type TablePickerFolderItem = DatabaseItem | SchemaItem;

export type TablePickerItem = TablePickerValueItem | TablePickerFolderItem;
