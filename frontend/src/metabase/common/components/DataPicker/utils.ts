import { humanize, titleize } from "metabase/lib/formatting";
import { isNullOrUndefined } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";
import type {
  CollectionItem,
  CollectionItemModel,
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

export const getDataPickerValue = (
  query: Lib.Query,
  stageIndex: number,
  joinable: Lib.Joinable,
): DataPickerValue | undefined => {
  const pickerInfo = Lib.pickerInfo(query, joinable);
  const displayInfo = Lib.displayInfo(query, stageIndex, joinable);

  if (!pickerInfo) {
    return undefined;
  }

  if (pickerInfo.cardId != null) {
    return {
      id: pickerInfo.cardId,
      name: displayInfo.displayName,
      model: displayInfo.isModel ? "dataset" : "card",
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

export const isTableItem = (
  value: DataPickerValue | undefined,
): value is TablePickerValue => {
  return value?.model === "table";
};

export const isValidValueItem = (model: SearchModel): boolean => {
  return ["table", "card", "dataset", "metric"].includes(model);
};

export const createShouldShowItem = (
  models: CollectionItemModel[],
  databaseId?: DatabaseId,
) => {
  return (item: QuestionPickerItem) => {
    if (item.model === "collection") {
      const below = item.below ?? [];
      const here = item.here ?? [];
      const contents = [...below, ...here];
      const hasCards = models.some(model => contents.includes(model));

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
