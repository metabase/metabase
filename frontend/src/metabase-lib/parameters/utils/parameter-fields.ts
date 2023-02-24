import Field from "metabase-lib/metadata/Field";
import {
  FieldFilterUiParameter,
  UiParameter,
} from "metabase-lib/parameters/types";

export const hasFields = (
  parameter: UiParameter,
): parameter is FieldFilterUiParameter => {
  return (parameter as FieldFilterUiParameter).fields != null;
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
