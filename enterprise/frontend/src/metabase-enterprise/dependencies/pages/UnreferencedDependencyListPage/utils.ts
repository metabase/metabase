import type * as Urls from "metabase/lib/urls";
import type { DependencyListRawParams } from "metabase-enterprise/dependencies/types";
import {
  type CardType,
  DEPENDENCY_GROUP_TYPES,
  DEPENDENCY_SORT_COLUMNS,
  DEPENDENCY_SORT_DIRECTIONS,
  type DependencyGroupType,
  type DependencyType,
} from "metabase-types/api";

import {
  getCardType,
  getDependencyType,
  parseEnum,
  parseList,
  parseNumber,
  parseString,
} from "../../utils";

export function parseRawParams(
  rawParams?: DependencyListRawParams,
): Urls.DependencyListParams {
  return {
    query: parseString(rawParams?.query),
    page: parseNumber(rawParams?.page),
    groupTypes: parseList(rawParams?.groupTypes, (value) =>
      parseEnum(value, DEPENDENCY_GROUP_TYPES),
    ),
    sortColumn: parseEnum(rawParams?.sortColumn, DEPENDENCY_SORT_COLUMNS),
    sortDirection: parseEnum(
      rawParams?.sortDirection,
      DEPENDENCY_SORT_DIRECTIONS,
    ),
  };
}

export function getSearchQuery(searchValue: string): string | undefined {
  const searchQuery = searchValue.trim();
  return searchQuery.length > 0 ? searchQuery : undefined;
}

export function getDependencyTypes(
  groupTypes: DependencyGroupType[],
): DependencyType[] {
  const types = groupTypes.map(getDependencyType);
  return Array.from(new Set(types));
}

export function getCardTypes(groupTypes: DependencyGroupType[]): CardType[] {
  const cardTypes = groupTypes
    .map(getCardType)
    .filter((cardType) => cardType !== null);
  return Array.from(new Set(cardTypes));
}
