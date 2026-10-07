import type { FieldValueOptions, InputSettingType } from "metabase-types/api";

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

export function textToOptions(text: string): FieldValueOptions {
  const options = text
    .trim()
    .split("\n")
    .map((option) => option.trim())
    .filter(Boolean);
  return [...new Set(options)];
}
