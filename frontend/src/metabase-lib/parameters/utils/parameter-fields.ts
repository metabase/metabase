import type Field from "metabase-lib/metadata/Field";
import type {
  UiParameterWithFields,
  UiParameter,
} from "metabase-lib/parameters/types";

export const hasFields = (
  parameter: UiParameter,
): parameter is UiParameterWithFields => {
  return (
    "fields" in parameter &&
    Array.isArray(parameter.fields) &&
    parameter.fields.length > 0
  );
};

export const getFields = (parameter: UiParameter): Field[] => {
  if (hasFields(parameter)) {
    return parameter.fields;
  } else {
    return [];
  }
};

export const getNonVirtualFields = (parameter: UiParameter) => {
  return getFields(parameter).filter(field => !field.isVirtual());
};
