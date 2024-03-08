import { isFieldFilterUiParameter } from "metabase-lib/parameters/utils/parameter-fields";
import {
  getParameterSubType,
  isNumberParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import type { Parameter } from "metabase-types/api";

export function shouldShowPlainInput(parameter: Parameter) {
  // TODO this is a way to distinguish a field selector from the others
  // isFieldFilterParameter or similar should be used here
  if (isFieldFilterUiParameter(parameter)) {
    return false;
  }

  // TODO this is current behavior, although for number/= we MIGHT
  // allow picking multiple values, so it should eventually take arity into account
  if (isNumberParameter(parameter)) {
    const subtype = getParameterSubType(parameter);
    return subtype === "=";
  }

  // TODO this means "string" + "input box" is selected
  if (
    parameter.type === "category" &&
    (parameter.values_query_type == null ||
      parameter.values_query_type === "none")
  ) {
    return true;
  }

  return false;
}

export function shouldShowListInput(parameter: Parameter) {
  if (
    parameter.type === "category" &&
    parameter.values_source_type === "static-list" &&
    parameter.values_source_config?.values &&
    parameter.values_source_config.values.length > 0
  ) {
    return true;
  }

  return false;
}
