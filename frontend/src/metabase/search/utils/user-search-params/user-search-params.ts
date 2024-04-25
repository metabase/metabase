import { isNotNull } from "metabase/lib/types";
import type { SearchQueryParamValue } from "metabase/search/types";
import type { UserId } from "metabase-types/api";

export const parseUserIdArray = (value: SearchQueryParamValue): UserId[] => {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    const parsedValue = parseUserId(value);
    return parsedValue ? [parsedValue] : [];
  }

  if (Array.isArray(value)) {
    const parsedIds: (number | null)[] = value.map(idString =>
      parseUserId(idString),
    );
    return parsedIds.filter(isNotNull);
  }

  return [];
};

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

export const stringifyUserIdArray = (
  value?: UserId[] | null,
): SearchQueryParamValue =>
  value ? value.map(idString => String(idString)) : [];
