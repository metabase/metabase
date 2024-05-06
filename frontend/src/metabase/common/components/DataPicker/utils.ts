import { humanize, titleize } from "metabase/lib/formatting";
import TableEntity from "metabase-lib/v1/metadata/Table";
import type {
  Card,
  Database,
  DatabaseId,
  SchemaName,
  Table,
  TableId,
} from "metabase-types/api";

import type {
  DataPickerValue,
  ModelItem,
  NotebookDataPickerFolderItem,
  NotebookDataPickerValueItem,
  QuestionItem,
  TablePickerValue,
} from "./types";

export const generateKey = (
  dbItem: NotebookDataPickerFolderItem | null,
  schemaItem: NotebookDataPickerFolderItem | null,
  tableItem: NotebookDataPickerValueItem | null,
) => {
  return [dbItem?.id, schemaItem?.id, tableItem?.id].join("-");
};

export const dataPickerValueFromCard = (card: Card): DataPickerValue => {
  return {
    id: card.id,
    name: card.name,
    model: card.type === "model" ? "dataset" : "card",
  };
};

export const dataPickerValueFromTable = (
  table: Table | TableEntity | null,
): TablePickerValue | undefined => {
  if (table === null) {
    return undefined;
  }

  // Temporary, for backward compatibility in DataStep, until entity framework is no more
  if (table instanceof TableEntity) {
    return tablePickerValueFromTableEntity(table);
  }

  return {
    db_id: table.db_id,
    id: table.id,
    model: "table",
    name: table.display_name,
    schema: table.schema,
  };
};

const tablePickerValueFromTableEntity = (
  table: TableEntity,
): TablePickerValue => {
  // In DBs without schemas, API will use an empty string to indicate the default, virtual schema
  const NO_SCHEMA_FALLBACK = "";

  return {
    db_id: table.db_id,
    id: table.id,
    model: "table",
    name: table.display_name,
    schema: table.schema_name ?? table.schema?.name ?? NO_SCHEMA_FALLBACK,
  };
};

export const getDbItem = (
  databases: Database[] | undefined,
  dbId: DatabaseId | undefined,
): NotebookDataPickerFolderItem | null => {
  if (typeof dbId === "undefined") {
    return null;
  }

  const database = databases?.find(db => db.id === dbId);
  const name = database?.name ?? "";

  return { model: "database", id: dbId, name };
};

export const getSchemaItem = (
  schemaName: SchemaName | undefined,
): NotebookDataPickerFolderItem | null => {
  if (typeof schemaName === "undefined") {
    return null;
  }

  const name = getSchemaDisplayName(schemaName);

  return { model: "schema", id: schemaName, name };
};

export const getTableItem = (
  tables: Table[] | undefined,
  tableId: TableId | undefined,
): NotebookDataPickerValueItem | null => {
  if (typeof tableId === "undefined") {
    return null;
  }

  const table = tables?.find(db => db.id === tableId);
  const name = table?.name ?? "";

  return { model: "table", id: tableId, name };
};

export const getSchemaDisplayName = (schemaName: SchemaName | undefined) => {
  if (typeof schemaName === "undefined") {
    return "";
  }

  return titleize(humanize(schemaName));
};

export const isModelItem = (
  value: DataPickerValue | undefined,
): value is ModelItem => {
  return value?.model === "dataset";
};

export const isQuestionItem = (
  value: DataPickerValue | undefined,
): value is QuestionItem => {
  return value?.model === "card";
};

export const isTableItem = (
  value: DataPickerValue | undefined,
): value is TablePickerValue => {
  return value?.model === "table";
};
