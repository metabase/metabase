import { t } from "ttag";

import { DATA_BUCKET } from "./constants";
import { DataTypeInfoItem } from "./types";

const DATASETS: DataTypeInfoItem = {
  id: DATA_BUCKET.DATASETS,
  icon: "model",
  name: t`Models`,
  description: t`The best starting place for new questions.`,
};

const RAW_DATA: DataTypeInfoItem = {
  id: DATA_BUCKET.RAW_DATA,
  icon: "database",
  name: t`Raw Data`,
  description: t`Unaltered tables in connected databases.`,
};

const SAVED_QUESTIONS: DataTypeInfoItem = {
  id: DATA_BUCKET.SAVED_QUESTIONS,
  name: t`Saved Questions`,
  icon: "folder",
  description: t`Use any question’s results to start a new question.`,
};

export function getDataTypes({
  hasModels,
  hasNestedQueriesEnabled,
  hasSavedQuestions,
}: {
  hasModels: boolean;
  hasNestedQueriesEnabled: boolean;
  hasSavedQuestions: boolean;
}): DataTypeInfoItem[] {
  const dataTypes: DataTypeInfoItem[] = [];

  if (hasNestedQueriesEnabled && hasModels) {
    dataTypes.push(DATASETS);
  }

  dataTypes.push(RAW_DATA);

  if (hasNestedQueriesEnabled && hasSavedQuestions) {
    dataTypes.push(SAVED_QUESTIONS);
  }

  return dataTypes;
}
