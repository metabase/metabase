import { isSortColumn } from "metabase/utils/sorting";
import type { SortDirection } from "metabase-types/api";

import type { QueryParam } from "./types";

export function getFirstParamValue(param: QueryParam) {
  return Array.isArray(param) ? param[0] : param;
}

export const getAllParamValues = (param: QueryParam): string[] => {
  if (Array.isArray(param)) {
    return param.filter((v): v is string => typeof v === "string");
  }
  return typeof param === "string" ? [param] : [];
};

export function parsePage(param: QueryParam): number {
  const value = getFirstParamValue(param);
  if (!value || !/^\d+$/.test(value)) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

export function parseSortColumn<TColumn extends string>(
  param: QueryParam,
  columns: readonly TColumn[],
  defaultColumn: TColumn,
): TColumn;
export function parseSortColumn<TColumn extends string>(
  param: QueryParam,
  columns: readonly TColumn[],
): TColumn | undefined;
export function parseSortColumn<TColumn extends string>(
  param: QueryParam,
  columns: readonly TColumn[],
  defaultColumn?: TColumn,
): TColumn | undefined {
  const value = getFirstParamValue(param);
  return value && isSortColumn(value, columns) ? value : defaultColumn;
}

export function parseSortDirection(
  param: QueryParam,
  defaultDirection: SortDirection,
): SortDirection;
export function parseSortDirection(
  param: QueryParam,
): SortDirection | undefined;
export function parseSortDirection(
  param: QueryParam,
  defaultDirection?: SortDirection,
): SortDirection | undefined {
  const value = getFirstParamValue(param);
  return value === "asc" || value === "desc" ? value : defaultDirection;
}
