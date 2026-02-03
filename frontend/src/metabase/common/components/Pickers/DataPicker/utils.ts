import { canCollectionCardBeUsed } from "metabase/common/components/Pickers/utils";
import * as Lib from "metabase-lib";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";
import type { DatabaseId, SchemaName } from "metabase-types/api";

import type { OmniPickerItem } from "../EntityPicker";

import {
  type DataPickerValue,
  isQuestionItem,
  isSchemaItem,
  isTableItem,
} from "./types";

export const getDataPickerValue = (
  query: Lib.Query,
  stageIndex: number,
  joinable: Lib.Joinable,
):
  | (DataPickerValue & { db_id?: DatabaseId; schema?: SchemaName })
  | undefined => {
  const pickerInfo = Lib.pickerInfo(query, joinable);
  const displayInfo = Lib.displayInfo(query, stageIndex, joinable);

  if (!pickerInfo) {
    return undefined;
  }

  if (pickerInfo.cardId != null) {
    return {
      id: pickerInfo.cardId,
      // name: displayInfo.displayName,
      model: displayInfo.isModel
        ? "dataset"
        : displayInfo.isMetric
          ? "metric"
          : "card",
      database_id: pickerInfo.databaseId,
      schema: getSchemaName(displayInfo.schema), // for compatibility with MiniPicker for now
    };
  }

  return {
    id: pickerInfo.tableId,
    model: "table",
    database_id: pickerInfo.databaseId,
    db_id: pickerInfo.databaseId, // for compatibility with MiniPicker for now
    schema: getSchemaName(displayInfo.schema), // for compatibility with MiniPicker for now
  };
};

/**
 * This is used to disable cards and tables that are not
 * in the specified database.
 */
export const shouldDisableItemNotInDb =
  (databaseId?: DatabaseId) =>
  (item: OmniPickerItem): boolean => {
    if (!databaseId) {
      return false;
    }

    if (item.model === "database") {
      return item.id !== databaseId;
    }

    if (isTableItem(item) || isSchemaItem(item)) {
      return item.database_id !== databaseId;
    }

    if (isQuestionItem(item)) {
      return canCollectionCardBeUsed(item) && item.database_id !== databaseId;
    }

    return false;
  };
