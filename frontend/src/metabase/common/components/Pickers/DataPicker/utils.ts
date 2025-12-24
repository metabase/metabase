import { canCollectionCardBeUsed } from "metabase/common/components/Pickers/utils";
import { isNullOrUndefined } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";
import type {
  CollectionItem,
  CollectionItemModel,
  DatabaseId,
  RecentItem,
  Table,
} from "metabase-types/api";

import type { QuestionPickerItem } from "../QuestionPicker";
import type { TablePickerItem, TablePickerValue } from "../TablePicker";

import type {
  DataPickerFolderItem,
  DataPickerItem,
  DataPickerValue,
  DataPickerValueItem,
  MetricItem,
  ModelItem,
  QuestionItem,
} from "./types";

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
      database_id: pickerInfo.databaseId,
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

type OmniPickerModel = CollectionItemModel | TablePickerItem["model"];

export const createShouldShowItem = (
  models: OmniPickerModel[],
  databaseId?: DatabaseId,
) => {
  return (
    item: QuestionPickerItem | (TablePickerItem & { database_id?: DatabaseId }),
  ) => {
    if (item.model === "collection") {
      if (item.id === "root" || item.is_personal) {
        return true;
      }

      const below = item.below ?? [];
      const here = item.here ?? [];
      const contents = [...below, ...here];
      const hasCards = models.some((model: OmniPickerModel) =>
        contents.includes(model as CollectionItemModel),
      );

      return hasCards;
    }

    if (!isNullOrUndefined(databaseId) && item.model === "database") {
      return item.id === databaseId;
    }

    if (item.model === "table") {
      const itemDbId = item.database_id ?? (item as unknown as Table).db_id;
      return isNullOrUndefined(databaseId) || itemDbId === databaseId;
    }

    if (item.model === "schema") {
      return isNullOrUndefined(databaseId) || item.dbId === databaseId;
    }

    const hasNoDb =
      isNullOrUndefined(databaseId) ||
      !hasDatabaseId(item) ||
      isNullOrUndefined(item.database_id);

    if (item.model === "card" && models.includes(item.model)) {
      return (
        canCollectionCardBeUsed(item as CollectionItem) &&
        (hasNoDb || item.database_id === databaseId)
      );
    }

    if (hasNoDb && models.includes(item.model)) {
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

export function getRecentItemDatabaseId(item: RecentItem) {
  if (item.model === "table") {
    return item.database.id;
  } else {
    return item.database_id;
  }
}
