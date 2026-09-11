import * as Urls from "metabase/urls";
import {
  CONTENT_DIAGNOSTICS_FILTER_TYPES,
  CONTENT_DIAGNOSTICS_IMBALANCED_SORT_COLUMNS,
  type ContentDiagnosticsImbalancedUserParams,
  SORT_DIRECTIONS,
} from "metabase-types/api";

export function parseImbalancedUrlParams(
  searchParams: URLSearchParams,
): Urls.ImbalancedContentParams {
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
    sortColumn: Urls.parseEnumParam(
      searchParams.get("sort-column"),
      CONTENT_DIAGNOSTICS_IMBALANCED_SORT_COLUMNS,
    ),
    sortDirection: Urls.parseEnumParam(
      searchParams.get("sort-direction"),
      SORT_DIRECTIONS,
    ),
  };
}

export function getImbalancedUserParams(
  params: Urls.ImbalancedContentParams,
): ContentDiagnosticsImbalancedUserParams {
  return {
    entity_types: params.entityTypes,
    include_personal_collections: params.includePersonalCollections,
    sort_column: params.sortColumn,
    sort_direction: params.sortDirection,
  };
}

export function parseImbalancedUserParams(
  params: ContentDiagnosticsImbalancedUserParams | undefined | "",
): Urls.ImbalancedContentParams {
  if (typeof params !== "object" || params == null) {
    return {};
  }

  return {
    entityTypes: params.entity_types,
    includePersonalCollections: params.include_personal_collections,
    sortColumn: params.sort_column,
    sortDirection: params.sort_direction,
  };
}

const IMBALANCED_URL_PARAM_KEYS = [
  "page",
  "query",
  "entity-types",
  "include-personal-collections",
  "sort-column",
  "sort-direction",
] as const;

export function isEmptyImbalancedParams(
  searchParams: URLSearchParams,
): boolean {
  return IMBALANCED_URL_PARAM_KEYS.every((key) => !searchParams.has(key));
}
