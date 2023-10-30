import type Field from "metabase-lib/metadata/Field";
import type {
  FieldFilterUiParameter,
  UiParameter,
} from "metabase-lib/parameters/types";

export const isFieldFilterUiParameter = (
  parameter: UiParameter,
): parameter is FieldFilterUiParameter => {
  return "fields" in parameter && parameter.fields != null;
};

export const hasFields = (parameter: UiParameter): boolean => {
  return isFieldFilterUiParameter(parameter) && parameter.fields.length > 0;
};

export const getFields = (parameter: UiParameter): Field[] => {
  if (isFieldFilterUiParameter(parameter) && hasFields(parameter)) {
    return parameter.fields;
  } else {
    return [];
  }
};

export const getNonVirtualFields = (parameter: UiParameter) => {
  return getFields(parameter).filter(field => !field.isVirtual());
};
