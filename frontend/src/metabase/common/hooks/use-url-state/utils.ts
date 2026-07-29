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
  const parsed = parseInt(value || "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function parseSortColumn<TColumn extends string>(
  param: QueryParam,
  columns: readonly TColumn[],
  defaultColumn: TColumn,
): TColumn {
  const value = getFirstParamValue(param);
  return value && isSortColumn(value, columns) ? value : defaultColumn;
}

export function parseSortDirection(
  param: QueryParam,
  defaultDirection: SortDirection,
): SortDirection {
  const value = getFirstParamValue(param);
  return value === "asc" || value === "desc" ? value : defaultDirection;
}
