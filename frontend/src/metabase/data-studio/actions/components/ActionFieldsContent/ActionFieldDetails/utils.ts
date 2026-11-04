import type {
  FieldType,
  FieldValueOptions,
  InputSettingType,
} from "metabase-types/api";

import { cleanOptionValues } from "../../../utils";

const DEFAULT_VALUE_INPUT_TYPES: Record<InputSettingType, string> = {
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

export function getDefaultValueInputType(inputType: InputSettingType): string {
  return DEFAULT_VALUE_INPUT_TYPES[inputType];
}

export function textToOptions(
  text: string,
  fieldType: FieldType,
): FieldValueOptions {
  const options = text
    .split("\n")
    .map((option) => option.trim())
    .filter(Boolean);
  return [...new Set(cleanOptionValues(options, fieldType))];
}
