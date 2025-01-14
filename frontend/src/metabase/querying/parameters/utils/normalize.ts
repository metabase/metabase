import type { DateFilterValue } from "metabase/querying/filters/types";
import type { ParameterValueOrArray } from "metabase-types/api";

import { deserializeDateFilter } from "./dates";

function normalizeArray(value: ParameterValueOrArray) {
  return Array.isArray(value) ? value : [value];
}

export function normalizeStringFilter(value: ParameterValueOrArray): string[] {
  return normalizeArray(value).reduce((values: string[], item) => {
    if (item != null && item !== "") {
      values.push(String(item));
    }
    return values;
  }, []);
}

export function normalizeNumberFilter(value: ParameterValueOrArray): number[] {
  return normalizeArray(value).reduce((values: number[], item) => {
    const number = typeof item === "number" ? item : parseFloat(String(item));
    if (isFinite(number)) {
      values.push(number);
    }
    return values;
  }, []);
}

export function normalizeBooleanFilter(
  value: ParameterValueOrArray,
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

export function normalizeDateFilter(
  value: ParameterValueOrArray,
): DateFilterValue | undefined {
  return typeof value === "string" ? deserializeDateFilter(value) : undefined;
}
