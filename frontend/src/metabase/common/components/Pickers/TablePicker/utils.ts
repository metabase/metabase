import { humanize, titleize } from "metabase/lib/formatting/strings";
import type {
  Database,
  DatabaseId,
  SchemaName,
  Table,
  TableId,
} from "metabase-types/api";

import type { TableItem, TablePickerFolderItem } from "./types";

export const generateKey = (
  dbItem: TablePickerFolderItem | null,
  schemaItem: TablePickerFolderItem | null,
  tableItem: TableItem | null,
) => {
  return [dbItem?.id, schemaItem?.id, tableItem?.id].join("-");
};

export const getDbItem = (
  databases: Database[] | undefined,
  dbId: DatabaseId | undefined,
): TablePickerFolderItem | null => {
  if (typeof dbId === "undefined") {
    return null;
  }

  const database = databases?.find((db) => db.id === dbId);
  const name = database?.name ?? "";

  return { model: "database", id: dbId, name };
};

export const getSchemaItem = (
  dbId: DatabaseId | undefined,
  dbName: string | undefined,
  schemaName: SchemaName | undefined,
  isOnlySchema: boolean,
): TablePickerFolderItem | null => {
  if (typeof schemaName === "undefined" || typeof dbId === "undefined") {
    return null;
  }

  const name = getSchemaDisplayName(schemaName);

  return { model: "schema", id: schemaName, name, dbId, dbName, isOnlySchema };
};

export const getTableItem = (
  tables: Table[] | undefined,
  tableId: TableId | undefined,
): TableItem | null => {
  if (typeof tableId === "undefined") {
    return null;
  }

  const table = tables?.find((db) => db.id === tableId);
  const name = table?.name ?? "";

  return {
    model: "table",
    id: tableId,
    name,
    database_id: table?.db_id,
  };
};

export const getSchemaDisplayName = (schemaName: SchemaName | undefined) => {
  if (typeof schemaName === "undefined") {
    return "";
  }

  return titleize(humanize(schemaName));
};
