import { b64hash_to_utf8, utf8_to_b64url } from "metabase/lib/encoding";
import type { Filter, OrderBy } from "metabase-types/api";

export const serializeMbqlParam = (filterMbql: Array<any>): string => {
  return utf8_to_b64url(JSON.stringify(filterMbql));
};

export const deserializeTableFilter = (filterParam: string): Filter | null => {
  const maybeFilter = JSON.parse(b64hash_to_utf8(filterParam));

  // simple and hacky way to test if param is a valid filter
  return Array.isArray(maybeFilter) && typeof maybeFilter[0] === "string"
    ? (maybeFilter as Filter)
    : null;
};

export const deserializeTableSorting = (
  sortingParam: string,
): Array<OrderBy> | null => {
  const maybeParam = JSON.parse(b64hash_to_utf8(sortingParam));

  // simple and hacky way to test if param is valid
  return Array.isArray(maybeParam) &&
    Array.isArray(maybeParam[0]) &&
    typeof maybeParam[0][0] === "string"
    ? (maybeParam as Array<OrderBy>)
    : null;
};
