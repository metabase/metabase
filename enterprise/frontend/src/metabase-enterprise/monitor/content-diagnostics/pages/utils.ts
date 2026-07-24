import type { Location } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  CONTENT_DIAGNOSTICS_FILTER_TYPES,
  type ContentDiagnosticsUserParams,
} from "metabase-types/api";

export function parseUrlParams(
  location: Location,
): Urls.ContentDiagnosticsParams {
  const {
    page,
    query,
    "entity-types": entityTypes,
    "include-personal-collections": includePersonalCollections,
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
  };
}

export function isEmptyParams(location: Location): boolean {
  return Object.values(location.query).every((value) => value == null);
}
