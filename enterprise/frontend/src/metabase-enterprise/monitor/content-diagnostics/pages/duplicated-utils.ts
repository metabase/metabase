import type { Location } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  CONTENT_DIAGNOSTICS_DUPLICATED_FILTER_TYPES,
  CONTENT_DIAGNOSTICS_DUPLICATED_SORT_COLUMNS,
  type ContentDiagnosticsDuplicatedUserParams,
  SORT_DIRECTIONS,
} from "metabase-types/api";

export function parseDuplicatedUrlParams(
  location: Location,
): Urls.DuplicatedContentParams {
  const {
    page,
    query,
    "entity-types": entityTypes,
    "include-personal-collections": includePersonalCollections,
    "min-duplicate-count": minDuplicateCount,
    "sort-column": sortColumn,
    "sort-direction": sortDirection,
  } = location.query;

  return {
    page: Urls.parseNumberParam(page),
    query: Urls.parseStringParam(query),
    entityTypes: Urls.parseListParam(entityTypes, (item) =>
      Urls.parseEnumParam(item, CONTENT_DIAGNOSTICS_DUPLICATED_FILTER_TYPES),
    ),
    includePersonalCollections: Urls.parseBooleanParam(
      includePersonalCollections,
    ),
    minDuplicateCount: Urls.parseNumberParam(minDuplicateCount),
    sortColumn: Urls.parseEnumParam(
      sortColumn,
      CONTENT_DIAGNOSTICS_DUPLICATED_SORT_COLUMNS,
    ),
    sortDirection: Urls.parseEnumParam(sortDirection, SORT_DIRECTIONS),
  };
}

export function getDuplicatedUserParams(
  params: Urls.DuplicatedContentParams,
): ContentDiagnosticsDuplicatedUserParams {
  return {
    entity_types: params.entityTypes,
    include_personal_collections: params.includePersonalCollections,
    min_duplicate_count: params.minDuplicateCount,
    sort_column: params.sortColumn,
    sort_direction: params.sortDirection,
  };
}

export function parseDuplicatedUserParams(
  params: ContentDiagnosticsDuplicatedUserParams | undefined | "",
): Urls.DuplicatedContentParams {
  if (typeof params !== "object" || params == null) {
    return {};
  }

  return {
    entityTypes: params.entity_types,
    includePersonalCollections: params.include_personal_collections,
    minDuplicateCount: params.min_duplicate_count,
    sortColumn: params.sort_column,
    sortDirection: params.sort_direction,
  };
}

const DUPLICATED_URL_PARAM_KEYS = [
  "page",
  "query",
  "entity-types",
  "include-personal-collections",
  "min-duplicate-count",
  "sort-column",
  "sort-direction",
] as const;

/**
 * Whether the URL asked for nothing at all. Explicitly passed default values still count as a
 * request, so a shared "reset to defaults" link wins over the visitor's own saved filters.
 */
export function isEmptyDuplicatedParams(location: Location): boolean {
  return DUPLICATED_URL_PARAM_KEYS.every((key) => location.query[key] == null);
}
