import { t } from "ttag";

import type { DataPickerDataType } from "./types";

export type DataTypeInfoItem = {
  id: DataPickerDataType;
  icon: string;
  name: string;
  description: string;
};

export function getDataTypes({
  hasNestedQueriesEnabled,
  hasModels,
}: {
  hasNestedQueriesEnabled: boolean;
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

    // TODO enable when DataPicker has items filtering API
    // dataTypes.push({
    //   id: "questions",
    //   name: t`Saved Questions`,
    //   icon: "folder",
    //   description: t`Use any question’s results to start a new question.`,
    // });
  }

  return dataTypes;
}
