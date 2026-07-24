import type { Location } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  CONTENT_DIAGNOSTICS_FILTER_TYPES,
  CONTENT_DIAGNOSTICS_SORT_COLUMNS,
  type ContentDiagnosticsUserParams,
  SORT_DIRECTIONS,
} from "metabase-types/api";

export function parseUrlParams(
  location: Location,
): Urls.ContentDiagnosticsParams {
  const {
    page,
    query,
    "entity-types": entityTypes,
    "include-personal-collections": includePersonalCollections,
    "sort-column": sortColumn,
    "sort-direction": sortDirection,
  } = location.query;

  return {
    page: Urls.parseNumberParam(page),
    query: Urls.parseStringParam(query),
    entityTypes: Urls.parseListParam(entityTypes, (item) =>
      Urls.parseEnumParam(item, CONTENT_DIAGNOSTICS_FILTER_TYPES),
    ),
    includePersonalCollections: Urls.parseBooleanParam(
      includePersonalCollections,
    ),
    sortColumn: Urls.parseEnumParam(
      sortColumn,
      CONTENT_DIAGNOSTICS_SORT_COLUMNS,
    ),
    sortDirection: Urls.parseEnumParam(sortDirection, SORT_DIRECTIONS),
  };
}

// The stored (last-used) filter state is the persisted subset of params —
// only the filter, not the ephemeral page/query.
export function getUserParams(
  params: Urls.ContentDiagnosticsParams,
): ContentDiagnosticsUserParams {
  return {
    entity_types: params.entityTypes,
    include_personal_collections: params.includePersonalCollections,
    sort_column: params.sortColumn,
    sort_direction: params.sortDirection,
  };
}

// When the value is not previously set, the BE returns an empty string.
export function parseUserParams(
  params: ContentDiagnosticsUserParams | undefined | "",
): Urls.ContentDiagnosticsParams {
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

export function isEmptyParams(location: Location): boolean {
  return Object.values(location.query).every((value) => value == null);
}
