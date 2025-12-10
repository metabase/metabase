import type * as Urls from "metabase/lib/urls";
import type { DependencyListRawParams } from "metabase-enterprise/dependencies/types";
import {
  DEPENDENCY_SORT_COLUMNS,
  DEPENDENCY_SORT_DIRECTIONS,
} from "metabase-types/api";

import { parseCardType, parseDependencyType } from "../../utils";

function parseNumber(
  number: string | string[] | undefined,
): number | undefined {
  if (typeof number !== "string") {
    return undefined;
  }
  return parseInt(number, 10);
}

function parseEnum<T>(
  value: string | string[] | undefined,
  items: readonly T[],
): T | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const item = items.find((item) => item === value);
  return item != null ? item : undefined;
}

function parseList<T>(
  value: string | string[] | undefined,
  parseItem: (value: unknown) => T | undefined,
): T[] | undefined {
  if (value == null) {
    return undefined;
  }
  const values = Array.isArray(value) ? value : [value];
  return values.map(parseItem).filter((item) => item != null);
}

export function parseRawParams(
  rawParams?: DependencyListRawParams,
): Urls.DependencyListParams {
  return {
    types: parseList(rawParams?.types, parseDependencyType),
    cardTypes: parseList(rawParams?.cardTypes, parseCardType),
    sortColumn: parseEnum(rawParams?.sortColumn, DEPENDENCY_SORT_COLUMNS),
    sortDirection: parseEnum(
      rawParams?.sortDirection,
      DEPENDENCY_SORT_DIRECTIONS,
    ),
    page: parseNumber(rawParams?.page),
  };
}

export function getSearchQuery(searchValue: string): string | undefined {
  const searchQuery = searchValue.trim();
  return searchQuery.length > 0 ? searchQuery : undefined;
}
