import { isFieldFilterUiParameter } from "metabase-lib/parameters/utils/parameter-fields";
import {
  getParameterSubType,
  isNumberParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import type { Parameter } from "metabase-types/api";

export function shouldUsePlainInput(parameter: Parameter) {
  // This is a way to distinguish a field selector from the others
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

export function shouldUseListPicker(parameter: Parameter): boolean {
  if (isFieldFilterUiParameter(parameter)) {
    return false;
  }

  return (
    parameter.type === "category" &&
    (parameter.values_query_type === "list" ||
      parameter.values_query_type === "search")
  );
}

export function getListParameterStaticValues(
  parameter: Parameter,
): string[] | null {
  if (parameter.values_source_type === "static-list") {
    return parameter.values_source_config?.values as string[];
  }

  return null;
}
