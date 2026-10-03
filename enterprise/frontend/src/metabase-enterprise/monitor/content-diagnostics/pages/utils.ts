import * as Urls from "metabase/urls";
import {
  CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES,
  CONTENT_DIAGNOSTICS_STALE_SORT_COLUMNS,
  type ContentDiagnosticsStaleUserParams,
  SORT_DIRECTIONS,
} from "metabase-types/api";

export function parseStaleUrlParams(
  searchParams: URLSearchParams,
): Urls.StaleContentParams {
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
    thresholdDays: Urls.parseNumberParam(searchParams.get("threshold-days")),
    sortColumn: Urls.parseEnumParam(
      searchParams.get("sort-column"),
      CONTENT_DIAGNOSTICS_STALE_SORT_COLUMNS,
    ),
    sortDirection: Urls.parseEnumParam(
      searchParams.get("sort-direction"),
      SORT_DIRECTIONS,
    ),
  };
}

export function getStaleUserParams(
  params: Urls.StaleContentParams,
): ContentDiagnosticsStaleUserParams {
  return {
    entity_types: params.entityTypes,
    include_personal_collections: params.includePersonalCollections,
    threshold_days: params.thresholdDays,
    sort_column: params.sortColumn,
    sort_direction: params.sortDirection,
  };
}

export function parseStaleUserParams(
  params: ContentDiagnosticsStaleUserParams | undefined | "",
): Urls.StaleContentParams {
  if (typeof params !== "object" || params == null) {
    return {};
  }

  return {
    entityTypes: params.entity_types,
    includePersonalCollections: params.include_personal_collections,
    thresholdDays: params.threshold_days,
    sortColumn: params.sort_column,
    sortDirection: params.sort_direction,
  };
}

const STALE_URL_PARAM_KEYS = [
  "page",
  "query",
  "entity-types",
  "include-personal-collections",
  "threshold-days",
  "sort-column",
  "sort-direction",
] as const;

export function isEmptyStaleParams(searchParams: URLSearchParams): boolean {
  return STALE_URL_PARAM_KEYS.every((key) => !searchParams.has(key));
}
