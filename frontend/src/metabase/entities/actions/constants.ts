import type { ParameterType } from "metabase-types/api";

interface FieldTypeMap {
  [key: string]: ParameterType;
}

export const fieldTypeToParameterTypeMap: FieldTypeMap = {
  string: "string/=",
  category: "string/=",
  number: "number/=",
};

export const dateTypetoParameterTypeMap: FieldTypeMap = {
  date: "date/single",
  datetime: "date/single",
  monthyear: "date/month-year",
  quarteryear: "date/quarter-year",
};
