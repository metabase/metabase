import { b64hash_to_utf8, utf8_to_b64url } from "metabase/lib/encoding";
import type { Filter } from "metabase-types/api";

export const serializeTableFilter = (filterMbql: Filter): string => {
  return utf8_to_b64url(JSON.stringify(filterMbql));
};

export const deserializeTableFilter = (filterParam: string): Filter | null => {
  const maybeFilter = JSON.parse(b64hash_to_utf8(filterParam));

  // simple and hacky way to test if param is a valid filter
  return Array.isArray(maybeFilter) && typeof maybeFilter[0] === "string"
    ? (maybeFilter as Filter)
    : null;
};
