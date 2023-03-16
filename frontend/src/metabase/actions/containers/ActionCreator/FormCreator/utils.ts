import { InputSettingType } from "metabase-types/api";

const inputTypeMap: Record<InputSettingType, string> = {
  string: "text",
  text: "textarea",
  date: "date",
  datetime: "datetime-local",
  time: "time",
  number: "number",
  boolean: "boolean",
  select: "text",
  radio: "text",
};

export const getDefaultValueInputType = (inputType: InputSettingType) => {
  return inputTypeMap[inputType];
};
