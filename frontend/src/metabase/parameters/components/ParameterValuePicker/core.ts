import { isFieldFilterUiParameter } from "metabase-lib/v1/parameters/utils/parameter-fields";
import { isNumberParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import type { Parameter } from "metabase-types/api";

export function shouldUsePlainInput(parameter: Parameter) {
  // This is a way to distinguish a field selector from the others
  if (isFieldFilterUiParameter(parameter)) {
    return false;
  }

  if (
    isNumberParameter(parameter) &&
    ((parameter.values_query_type !== "list" &&
      parameter.values_query_type !== "search") ||
      !parameter.values_source_config)
  ) {
    return true;
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

  if (
    parameter.values_query_type !== "list" &&
    parameter.values_query_type !== "search"
  ) {
    return false;
  }

  if (parameter.type === "category" || isNumberParameter(parameter)) {
    return parameter.values_source_config !== undefined;
  }

  return false;
}

export function isStaticListParam(parameter: Parameter) {
  return parameter.values_source_type === "static-list";
}

export function getListParameterStaticValues(
  parameter: Parameter,
): string[] | null {
  if (isStaticListParam(parameter)) {
    if (!parameter.values_source_config?.values) {
      return null;
    }

    return parameter.values_source_config.values
      .map(v => (Array.isArray(v) ? v[0]?.toString() : v))
      .filter((v): v is string => v !== undefined);
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
