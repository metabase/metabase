import type { UserId } from "metabase-types/api";
import type { SearchQueryParamValue } from "metabase/search/types";

export const parseUserId = (value: SearchQueryParamValue): UserId | null => {
  if (!value || Array.isArray(value)) {
    return null;
  }
  const numValue = Number(value);

  if (!numValue || isNaN(numValue) || numValue <= 0) {
    return null;
  }

  return numValue;
};

export const stringifyUserId = (value: UserId | null): SearchQueryParamValue =>
  Number.isInteger(value) ? String(value) : null;
