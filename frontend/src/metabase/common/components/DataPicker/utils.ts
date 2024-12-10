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
  Table,
  TableId,
} from "metabase-types/api";

import type { QuestionPickerItem } from "../QuestionPicker";

import type {
  DataPickerFolderItem,
  DataPickerItem,
  DataPickerValue,
  DataPickerValueItem,
  MetricItem,
  ModelItem,
  QuestionItem,
  TablePickerValue,
} from "./types";

export const generateKey = (
  dbItem: DataPickerFolderItem | null,
  schemaItem: DataPickerFolderItem | null,
  tableItem: DataPickerValueItem | null,
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

export const getDbItem = (
  databases: Database[] | undefined,
  dbId: DatabaseId | undefined,
): DataPickerFolderItem | null => {
  if (typeof dbId === "undefined") {
    return null;
  }

  const database = databases?.find(db => db.id === dbId);
  const name = database?.name ?? "";

  return { model: "database", id: dbId, name };
};

export const getSchemaItem = (
  dbId: DatabaseId | undefined,
  dbName: string | undefined,
  schemaName: SchemaName | undefined,
  isOnlySchema: boolean,
): DataPickerFolderItem | null => {
  if (typeof schemaName === "undefined" || typeof dbId === "undefined") {
    return null;
  }

  const name = getSchemaDisplayName(schemaName);

  return { model: "schema", id: schemaName, name, dbId, dbName, isOnlySchema };
};

export const getTableItem = (
  tables: Table[] | undefined,
  tableId: TableId | undefined,
): DataPickerValueItem | null => {
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

export const isCollectionItem = (
  value: DataPickerValue | undefined,
): value is QuestionItem | ModelItem | MetricItem => {
  return isQuestionItem(value) || isModelItem(value) || isMetricItem(value);
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
): value is MetricItem => {
  return value?.model === "metric";
};

export const isTableItem = (
  value: DataPickerValue | undefined,
): value is TablePickerValue => {
  return value?.model === "table";
};

export const isValueItem = (
  item: DataPickerItem,
): item is DataPickerValueItem => {
  return ["table", "card", "dataset", "metric"].includes(item.model);
};

export const isFolderItem = (
  item: DataPickerItem,
): item is DataPickerFolderItem => {
  return ["collection", "database", "schema"].includes(item.model);
};

export const createShouldShowItem = (
  models: CollectionItemModel[],
  databaseId?: DatabaseId,
) => {
  return (item: QuestionPickerItem & { database_id?: DatabaseId }) => {
    if (item.model === "collection") {
      if (item.id === "root" || item.is_personal) {
        return true;
      }

      const below = item.below ?? [];
      const here = item.here ?? [];
      const contents = [...below, ...here];
      const hasCards = models.some(model =>
        contents.includes(model as CollectionItemModel),
      );

      return hasCards;
    }
    if (
      (isNullOrUndefined(databaseId) ||
        !hasDatabaseId(item) ||
        isNullOrUndefined(item.database_id)) &&
      models.includes(item.model)
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

export const castQuestionPickerItemToDataPickerItem = (
  item: QuestionPickerItem,
): DataPickerItem => {
  // see comment for QuestionPickerItem definition to see why we need this cast
  return item as DataPickerItem;
};

export const createQuestionPickerItemSelectHandler = (
  onItemSelect: (item: DataPickerItem) => void,
) => {
  return (questionPickerItem: QuestionPickerItem) => {
    const item = castQuestionPickerItemToDataPickerItem(questionPickerItem);
    onItemSelect(item);
  };
};
