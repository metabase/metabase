import { t } from "ttag";

import { DATA_BUCKET } from "./constants";
import { DataTypeInfoItem } from "./types";

export function getDataTypes({
  hasModels,
  hasNestedQueriesEnabled,
  hasRawData,
  hasSavedQuestions,
}: {
  hasModels: boolean;
  hasNestedQueriesEnabled: boolean;
  hasRawData: boolean;
  hasSavedQuestions: boolean;
}): DataTypeInfoItem[] {
  const dataTypes: DataTypeInfoItem[] = [];

  if (hasNestedQueriesEnabled && hasModels) {
    dataTypes.push({
      id: DATA_BUCKET.DATASETS,
      icon: "model",
      name: t`Models`,
      description: t`The best starting place for new questions.`,
    });
  }

  if (hasRawData) {
    dataTypes.push({
      id: DATA_BUCKET.RAW_DATA,
      icon: "database",
      name: t`Raw Data`,
      description: t`Unaltered tables in connected databases.`,
    });
  }

  if (hasNestedQueriesEnabled && hasSavedQuestions) {
    dataTypes.push({
      id: DATA_BUCKET.SAVED_QUESTIONS,
      name: t`Saved Questions`,
      icon: "folder",
      description: t`Use any question’s results to start a new question.`,
    });
  }

  return dataTypes;
}
