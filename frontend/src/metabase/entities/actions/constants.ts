import type { ParameterType } from "metabase-types/api";
import type { TemplateTagType } from "metabase-types/types/Query";

interface FieldTypeMap {
  [key: string]: ParameterType;
}

interface TagTypeMap {
  [key: string]: TemplateTagType;
}

export const fieldTypeToParameterTypeMap: FieldTypeMap = {
  string: "string/=",
  category: "string/=",
  number: "number/=",
};

export const dateTypeToParameterTypeMap: FieldTypeMap = {
  date: "date/single",
  datetime: "date/single",
  monthyear: "date/month-year",
  quarteryear: "date/quarter-year",
};

export const fieldTypeToTagTypeMap: TagTypeMap = {
  string: "text",
  category: "text",
  number: "number",
  date: "date",
};
