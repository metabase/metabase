import { humanize, titleize } from "metabase/lib/formatting";
import { isNullOrUndefined } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import TableEntity from "metabase-lib/v1/metadata/Table";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";
import type {
  Card,
  CollectionItem,
  Database,
  DatabaseId,
  SchemaName,
  SearchModel,
  Table,
  TableId,
} from "metabase-types/api";

import type { QuestionPickerItem } from "../QuestionPicker";

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
    model:
      card.type === "model"
        ? "dataset"
        : card.type === "metric"
        ? "metric"
        : "card",
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

export const dataPickerValueFromJoinable = (
  query: Lib.Query,
  stageIndex: number,
  joinable: Lib.Joinable,
): DataPickerValue | undefined => {
  const pickerInfo = Lib.pickerInfo(query, joinable);
  const displayInfo = Lib.displayInfo(query, stageIndex, joinable);

  if (!pickerInfo) {
    return undefined;
  }

  if (typeof pickerInfo.cardId === "number") {
    return {
      id: pickerInfo.cardId,
      name: displayInfo.displayName,
      model: displayInfo.isModel
        ? "dataset"
        : displayInfo.isMetric
        ? "metric"
        : "card",
    };
  }

  return {
    id: pickerInfo.tableId,
    name: displayInfo.displayName,
    model: "table",
    db_id: pickerInfo.databaseId,
    schema: getSchemaName(displayInfo.schema),
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

export const isQuestionItem = (
  value: DataPickerValue | undefined,
): value is QuestionItem => {
  return value?.model === "card";
};

export const isModelItem = (
  value: DataPickerValue | undefined,
): value is ModelItem => {
  return value?.model === "dataset";
};

export const isMetricItem = (
  value: DataPickerValue | undefined,
): value is ModelItem => {
  return value?.model === "metric";
};

export const isTableItem = (
  value: DataPickerValue | undefined,
): value is TablePickerValue => {
  return value?.model === "table";
};

export const isValidValueItem = (model: SearchModel): boolean => {
  return ["table", "card", "dataset", "metric"].includes(model);
};

export const createShouldShowItem = (databaseId?: DatabaseId) => {
  return (item: QuestionPickerItem) => {
    if (item.model === "collection") {
      const below = item.below ?? [];
      const here = item.here ?? [];
      const contents = [...below, ...here];
      const hasCards =
        contents.includes("card") ||
        contents.includes("dataset") ||
        contents.includes("metric");

      if (item.id !== "root" && !item.is_personal && !hasCards) {
        return false;
      }
    }

    if (
      isNullOrUndefined(databaseId) ||
      !hasDatabaseId(item) ||
      isNullOrUndefined(item.database_id)
    ) {
      return true;
    }

    return item.database_id === databaseId;
  };
};

const hasDatabaseId = (
  value: unknown,
): value is Pick<CollectionItem, "database_id"> => {
  return typeof value === "object" && value != null && "database_id" in value;
};
