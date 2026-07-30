import type { Location } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  CONTENT_DIAGNOSTICS_FILTER_TYPES,
  CONTENT_DIAGNOSTICS_SLOW_SORT_COLUMNS,
  type ContentDiagnosticsSlowUserParams,
  SORT_DIRECTIONS,
} from "metabase-types/api";

import { getSlowParamsWithoutDefaults } from "../components/slow-utils";

export function parseSlowUrlParams(location: Location): Urls.SlowContentParams {
  const {
    page,
    query,
    "entity-types": entityTypes,
    "include-personal-collections": includePersonalCollections,
    "min-duration-ms": minDurationMs,
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
    minDurationMs: Urls.parseNumberParam(minDurationMs),
    sortColumn: Urls.parseEnumParam(
      sortColumn,
      CONTENT_DIAGNOSTICS_SLOW_SORT_COLUMNS,
    ),
    sortDirection: Urls.parseEnumParam(sortDirection, SORT_DIRECTIONS),
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

export function isEmptySlowParams(location: Location): boolean {
  return Object.values(
    getSlowParamsWithoutDefaults(parseSlowUrlParams(location)),
  ).every((value) => value == null);
}
