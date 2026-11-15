import { t } from "ttag";

import * as Lib from "metabase-lib";
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
  const databaseId = Lib.databaseID(query) ?? undefined;
  const displayInfo = Lib.displayInfo(query, stageIndex, joinable);

  if (Lib.isCardMetadata(joinable)) {
    return {
      id: Lib.pickerInfo(query, joinable).id,
      // name: displayInfo.displayName,
      model: displayInfo.isModel
        ? "dataset"
        : displayInfo.isMetric
          ? "metric"
          : "card",
      database_id: databaseId,
      schema: displayInfo.schema ?? undefined, // for compatibility with MiniPicker for now
    };
  }

  return {
    id: Lib.pickerInfo(query, joinable).id,
    model: "table",
    database_id: databaseId,
    db_id: databaseId, // for compatibility with MiniPicker for now
    schema: displayInfo.schema ?? undefined, // for compatibility with MiniPicker for now
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
      return item.database_id !== databaseId;
    }

    return false;
  };

export const getItemNotInDbTooltip =
  (databaseId?: DatabaseId) =>
  (item: OmniPickerItem): string | undefined =>
    shouldDisableItemNotInDb(databaseId)(item)
      ? t`You can't combine data from different databases.`
      : undefined;
