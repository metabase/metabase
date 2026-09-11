import * as Urls from "metabase/urls";
import {
  CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES,
  CONTENT_DIAGNOSTICS_SLOW_SORT_COLUMNS,
  type ContentDiagnosticsSlowUserParams,
  SORT_DIRECTIONS,
} from "metabase-types/api";

export function parseSlowUrlParams(
  searchParams: URLSearchParams,
): Urls.SlowContentParams {
  return {
    page: Urls.parseNumberParam(searchParams.get("page")),
    query: Urls.parseStringParam(searchParams.get("query")),
    entityTypes: Urls.parseListParam(
      searchParams.getAll("entity-types"),
      (item) =>
        Urls.parseEnumParam(
          item,
          CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES,
        ),
    ),
    includePersonalCollections: Urls.parseBooleanParam(
      searchParams.get("include-personal-collections"),
    ),
    minDurationMs: Urls.parseNumberParam(searchParams.get("min-duration-ms")),
    sortColumn: Urls.parseEnumParam(
      searchParams.get("sort-column"),
      CONTENT_DIAGNOSTICS_SLOW_SORT_COLUMNS,
    ),
    sortDirection: Urls.parseEnumParam(
      searchParams.get("sort-direction"),
      SORT_DIRECTIONS,
    ),
  };
}

export function getSlowUserParams(
  params: Urls.SlowContentParams,
): ContentDiagnosticsSlowUserParams {
  return {
    entity_types: params.entityTypes,
    include_personal_collections: params.includePersonalCollections,
    min_duration_ms: params.minDurationMs,
    sort_column: params.sortColumn,
    sort_direction: params.sortDirection,
  };
}

export function parseSlowUserParams(
  params: ContentDiagnosticsSlowUserParams | undefined | "",
): Urls.SlowContentParams {
  if (typeof params !== "object" || params == null) {
    return {};
  }

  return {
    entityTypes: params.entity_types,
    includePersonalCollections: params.include_personal_collections,
    minDurationMs: params.min_duration_ms,
    sortColumn: params.sort_column,
    sortDirection: params.sort_direction,
  };
}

const SLOW_URL_PARAM_KEYS = [
  "page",
  "query",
  "entity-types",
  "include-personal-collections",
  "min-duration-ms",
  "sort-column",
  "sort-direction",
] as const;

export function isEmptySlowParams(searchParams: URLSearchParams): boolean {
  return SLOW_URL_PARAM_KEYS.every((key) => !searchParams.has(key));
}
