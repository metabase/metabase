import type { UserId } from "metabase-types/api";
import type { SearchQueryParamValue } from "metabase/search/types";
import { isNotNull } from "metabase/core/utils/types";

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

export const parseUserId = (
  value: string | null | undefined,
): UserId | null => {
  if (!value) {
    return null;
  }

  const numValue = Number(value);

  if (!numValue || isNaN(numValue) || numValue <= 0) {
    return null;
  }

  return numValue;
};

export const convertUserIdToString = (
  userIdList: UserId[] | null | undefined,
): SearchQueryParamValue =>
  userIdList ? userIdList.map(userId => String(userId)) : [];
