import type { Location } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  CONTENT_DIAGNOSTICS_DUPLICATED_FILTER_TYPES,
  CONTENT_DIAGNOSTICS_DUPLICATED_SORT_COLUMNS,
  type ContentDiagnosticsDuplicatedUserParams,
  SORT_DIRECTIONS,
} from "metabase-types/api";

import { getDuplicatedParamsWithoutDefaults } from "../components/duplicated-utils";

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

export function isEmptyDuplicatedParams(location: Location): boolean {
  return Object.values(
    getDuplicatedParamsWithoutDefaults(parseDuplicatedUrlParams(location)),
  ).every((value) => value == null);
}
