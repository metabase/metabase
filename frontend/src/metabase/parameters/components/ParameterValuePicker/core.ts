import { isFieldFilterUiParameter } from "metabase-lib/v1/parameters/utils/parameter-fields";
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

  // This is current behavior, although for number/= we MIGHT
  // allow picking multiple values, so it should eventually take arity into account
  if (isNumberParameter(parameter)) {
    const subtype = getParameterSubType(parameter);
    return subtype === "=";
  }

  // This means "string" + "input box" is selected
  if (
    parameter.type === "category" &&
    (parameter.values_query_type == null ||
      parameter.values_query_type === "none" ||
      // parameter with unset source config and no values
      parameter.values_source_config === undefined)
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
      parameter.values_query_type === "search") &&
    parameter.values_source_config !== undefined
  );
}

export function isStaticListParam(parameter: Parameter) {
  return parameter.values_source_type === "static-list";
}

export function getListParameterStaticValues(
  parameter: Parameter,
): string[] | null {
  if (isStaticListParam(parameter)) {
    return parameter.values_source_config?.values ?? null;
  }
  return null;
}

// TODO Change this (metabase#40226)
export function getFlattenedStrings(values: unknown[][] | unknown[]): string[] {
  return values.flat(1).map(value => String(value));
}

export function shouldEnableSearch(
  parameter: Parameter,
  maxCount: number,
): boolean {
  if (parameter.values_query_type === "search") {
    return true;
  }
  const staticValues = getListParameterStaticValues(parameter);
  return !staticValues || staticValues.length > maxCount;
}

// TODO Change this (metabase#40226)
export function getSingleStringOrNull(value: unknown): null | string {
  const single = Array.isArray(value) ? value[0] : value;
  return single == null ? single : String(single);
}
