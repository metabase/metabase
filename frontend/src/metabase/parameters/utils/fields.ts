import { UiParameter } from "metabase/parameters/types";

export function hasFieldValues(parameter: UiParameter) {
  if ("fields" in parameter) {
    return (
      Array.isArray(parameter.fields) &&
      parameter.fields.some(field => field.hasFieldValues())
    );
  }

  return false;
}

export function hasFields(parameter: UiParameter) {
  if ("fields" in parameter) {
    return Array.isArray(parameter.fields) && parameter.fields.length > 0;
  }

  return false;
}
