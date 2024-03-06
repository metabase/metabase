import {
  getParameterSubType,
  isNumberParameter,
} from "metabase-lib/parameters/utils/parameter-type";
import type { Parameter } from "metabase-types/api";

export function shouldShowPlainInput(parameter: Parameter) {
  // TODO this is a way to distinguish a field selector from the others
  // isFieldFilterParameter or similar should be used here
  const hasFields = Boolean((parameter as any).fields);
  if (hasFields) {
    return false;
  }

  // TODO this is current behavior, although for number/= we MIGHT
  // allow picking multiple values, so it should eventually take arity into account
  if (isNumberParameter(parameter)) {
    const subtype = getParameterSubType(parameter);
    return subtype === "=";
  }

  // TODO this means "string" selected in native query tag editor
  // sidebar.
  // Although we did show a popup previously values_query_type in ('list', 'search'),
  // it was still a single value
  if (
    parameter.type === "category" &&
    (parameter.values_query_type == null ||
      parameter.values_query_type === "none")
  ) {
    return true;
  }

  return false;
}
