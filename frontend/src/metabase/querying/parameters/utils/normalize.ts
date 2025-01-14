import type { DateFilterValue } from "metabase/querying/filters/types";
import type { ParameterValueOrArray } from "metabase-types/api";

import { deserializeDateFilter } from "./dates";

function normalizeArray(value: ParameterValueOrArray | null) {
  if (value == null) {
    return [];
  } else {
    return Array.isArray(value) ? value : [value];
  }
}

export function normalizeStringParameterValue(
  value: ParameterValueOrArray | null,
): string[] {
  return normalizeArray(value).reduce((values: string[], item) => {
    if (item != null && item !== "") {
      values.push(String(item));
    }
    return values;
  }, []);
}

export function normalizeNumberParameterValue(
  value: ParameterValueOrArray | null,
): number[] {
  return normalizeArray(value).reduce((values: number[], item) => {
    const number = typeof item === "number" ? item : parseFloat(String(item));
    if (isFinite(number)) {
      values.push(number);
    }
    return values;
  }, []);
}

export function normalizeBooleanParameterValue(
  value: ParameterValueOrArray | null,
): boolean[] {
  return normalizeArray(value).reduce((values: boolean[], item) => {
    if (typeof item === "boolean") {
      values.push(item);
    }
    if (item === "true") {
      values.push(true);
    }
    if (item === "false") {
      values.push(false);
    }
    return values;
  }, []);
}

export function normalizeDateParameterValue(
  value: ParameterValueOrArray | null,
): DateFilterValue | undefined {
  return typeof value === "string" ? deserializeDateFilter(value) : undefined;
}
