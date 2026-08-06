import * as Urls from "metabase/urls";
import {
  CONTENT_DIAGNOSTICS_DUPLICATED_SORT_COLUMNS,
  CONTENT_DIAGNOSTICS_FILTER_TYPES,
  type ContentDiagnosticsDuplicatedUserParams,
  SORT_DIRECTIONS,
} from "metabase-types/api";

export function parseDuplicatedUrlParams(
  searchParams: URLSearchParams,
): Urls.DuplicatedContentParams {
  return {
    page: Urls.parseNumberParam(searchParams.get("page")),
    query: Urls.parseStringParam(searchParams.get("query")),
    entityTypes: Urls.parseListParam(
      searchParams.getAll("entity-types"),
      (item) => Urls.parseEnumParam(item, CONTENT_DIAGNOSTICS_FILTER_TYPES),
    ),
    includePersonalCollections: Urls.parseBooleanParam(
      searchParams.get("include-personal-collections"),
    ),
    minDuplicateCount: Urls.parseNumberParam(
      searchParams.get("min-duplicate-count"),
    ),
    sortColumn: Urls.parseEnumParam(
      searchParams.get("sort-column"),
      CONTENT_DIAGNOSTICS_DUPLICATED_SORT_COLUMNS,
    ),
    sortDirection: Urls.parseEnumParam(
      searchParams.get("sort-direction"),
      SORT_DIRECTIONS,
    ),
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

export function isEmptyDuplicatedParams(
  searchParams: URLSearchParams,
): boolean {
  return DUPLICATED_URL_PARAM_KEYS.every((key) => !searchParams.has(key));
}
