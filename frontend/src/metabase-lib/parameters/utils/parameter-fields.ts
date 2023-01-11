import { isVirtualFieldId } from "metabase-lib/metadata/utils/fields";
import {
  FieldFilterUiParameter,
  UiParameter,
} from "metabase-lib/parameters/types";

export const hasFields = (
  parameter: UiParameter,
): parameter is FieldFilterUiParameter => {
  return (parameter as FieldFilterUiParameter).fields != null;
};

export const getFields = (parameter: UiParameter) => {
  if (hasFields(parameter)) {
    return parameter.fields;
  } else {
    return [];
  }
};

export const getNonVirtualFields = (parameter: UiParameter) => {
  return getFields(parameter).filter(field => !isVirtualFieldId(field.id));
};
