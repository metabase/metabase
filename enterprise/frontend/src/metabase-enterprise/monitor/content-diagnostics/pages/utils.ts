import type { Location } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  CONTENT_DIAGNOSTICS_FILTER_TYPES,
  CONTENT_DIAGNOSTICS_STALE_SORT_COLUMNS,
  type ContentDiagnosticsStaleUserParams,
  SORT_DIRECTIONS,
} from "metabase-types/api";

import { getStaleParamsWithoutDefaults } from "../components/stale-utils";

export function parseStaleUrlParams(
  location: Location,
): Urls.StaleContentParams {
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
      CONTENT_DIAGNOSTICS_STALE_SORT_COLUMNS,
    ),
    sortDirection: Urls.parseEnumParam(sortDirection, SORT_DIRECTIONS),
  };
}

export function getStaleUserParams(
  params: Urls.StaleContentParams,
): ContentDiagnosticsStaleUserParams {
  return {
    entity_types: params.entityTypes,
    include_personal_collections: params.includePersonalCollections,
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
    sortColumn: params.sort_column,
    sortDirection: params.sort_direction,
  };
}

export function isEmptyStaleParams(location: Location): boolean {
  return Object.values(
    getStaleParamsWithoutDefaults(parseStaleUrlParams(location)),
  ).every((value) => value == null);
}
