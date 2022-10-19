import { t } from "ttag";

import type { DataPickerDataType } from "./types";

export type DataTypeInfoItem = {
  id: DataPickerDataType;
  icon: string;
  name: string;
  description: string;
};

export function getDataTypes(): DataTypeInfoItem[] {
  return [
    {
      id: "models",
      icon: "model",
      name: t`Models`,
      description: t`The best starting place for new questions.`,
    },
    {
      id: "raw-data",
      icon: "database",
      name: t`Raw Data`,
      description: t`Unaltered tables in connected databases.`,
    },
    // TODO enable when DataPicker has items filtering API
    // {
    //   id: "questions",
    //   name: t`Saved Questions`,
    //   icon: "folder",
    //   description: t`Use any question’s results to start a new question.`,
    // },
  ];
}
