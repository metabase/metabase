import type * as Urls from "metabase/lib/urls";
import type { DependencyListRawParams } from "metabase-enterprise/dependencies/types";
import type {
  CardType,
  DependencyGroupType,
  DependencySortColumn,
  DependencySortDirection,
  DependencyType,
} from "metabase-types/api";

import { getCardType, getDependencyType } from "../../utils";

function parseNumber(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return parseInt(value, 10);
}

function parseList<T>(
  value: unknown,
  parseItem: (value: unknown) => T | undefined,
): T[] | undefined {
  if (value == null) {
    return undefined;
  }
  const values = Array.isArray(value) ? value : [value];
  return values.map(parseItem).filter((item) => item != null);
}

function parseDependencyGroupType(
  value: unknown,
): DependencyGroupType | undefined {
  switch (value) {
    case "question":
    case "model":
    case "metric":
    case "table":
    case "transform":
    case "snippet":
    case "dashboard":
    case "document":
    case "sandbox":
    case "segment":
      return value;
    default:
      return undefined;
  }
}

function parseDependencySortColumn(
  value: unknown,
): DependencySortColumn | undefined {
  switch (value) {
    case "name":
      return value;
    default:
      return undefined;
  }
}

function parseDependencySortDirection(
  value: unknown,
): DependencySortDirection | undefined {
  switch (value) {
    case "asc":
    case "desc":
      return value;
    default:
      return undefined;
  }
}

export function parseRawParams(
  rawParams?: DependencyListRawParams,
): Urls.DependencyListParams {
  return {
    page: parseNumber(rawParams?.page),
    groupTypes: parseList(rawParams?.groupTypes, parseDependencyGroupType),
    sortColumn: parseDependencySortColumn(rawParams?.sortColumn),
    sortDirection: parseDependencySortDirection(rawParams?.sortDirection),
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
