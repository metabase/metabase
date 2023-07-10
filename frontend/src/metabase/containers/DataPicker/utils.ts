import { t } from "ttag";

import { IconName } from "metabase/core/components/Icon";

import { DATA_BUCKET } from "./constants";
import type { DataPickerDataType } from "./types";

export type DataTypeInfoItem = {
  id: DataPickerDataType;
  icon: IconName;
  name: string;
  description: string;
};

export function getDataTypes({
  hasNestedQueriesEnabled,
  hasSavedQuestions,
  hasModels,
}: {
  hasNestedQueriesEnabled: boolean;
  hasSavedQuestions: boolean;
  hasModels: boolean;
}): DataTypeInfoItem[] {
  const dataTypes: DataTypeInfoItem[] = [
    {
      id: DATA_BUCKET.RAW_DATA,
      icon: "database",
      name: t`Raw Data`,
      description: t`Unaltered tables in connected databases.`,
    },
  ];

  if (hasNestedQueriesEnabled) {
    if (hasModels) {
      dataTypes.unshift({
        id: DATA_BUCKET.DATASETS,
        icon: "model",
        name: t`Models`,
        description: t`The best starting place for new questions.`,
      });
    }

    if (hasSavedQuestions) {
      dataTypes.push({
        id: DATA_BUCKET.SAVED_QUESTIONS,
        name: t`Saved Questions`,
        icon: "folder",
        description: t`Use any question’s results to start a new question.`,
      });
    }
  }

  return dataTypes;
}
