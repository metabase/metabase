import { t } from "ttag";

import { IconName } from "metabase/core/components/Icon";
import type { DataPickerDataType, DataPickerFilters } from "./types";

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
      id: "raw-data",
      icon: "database",
      name: t`Raw Data`,
      description: t`Unaltered tables in connected databases.`,
    },
  ];

  if (hasNestedQueriesEnabled) {
    if (hasModels) {
      dataTypes.unshift({
        id: "models",
        icon: "model",
        name: t`Models`,
        description: t`The best starting place for new questions.`,
      });
    }

    if (hasSavedQuestions) {
      dataTypes.push({
        id: "questions",
        name: t`Saved Questions`,
        icon: "folder",
        description: t`Use any question’s results to start a new question.`,
      });
    }
  }

  return dataTypes;
}

export const DEFAULT_DATA_PICKER_FILTERS: DataPickerFilters = {
  types: () => true,
  databases: () => true,
  schemas: () => true,
  tables: () => true,
};
