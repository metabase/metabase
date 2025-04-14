import { b64hash_to_utf8, utf8_to_b64url } from "metabase/lib/encoding";
import type { Filter } from "metabase-types/api";

export const serializeTableFilter = (filterMbql: Filter): string => {
  return utf8_to_b64url(JSON.stringify(filterMbql));
};

export const deserializeTableFilter = (filterParam: string): Filter => {
  return JSON.parse(b64hash_to_utf8(filterParam)) as Filter;
};
