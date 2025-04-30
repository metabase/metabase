import * as Urls from "metabase/lib/urls";

import type { ParsedRouteParams, RouteParams } from "./types";

export function parseRouteParams(params: RouteParams): ParsedRouteParams {
  return {
    databaseId: Urls.extractEntityId(params.databaseId),
    schemaId: params.schemaId,
    tableId: Urls.extractEntityId(params.tableId),
    fieldId: Urls.extractEntityId(params.fieldId),
  };
}

export function getUrl(params: ParsedRouteParams): string {
  const { databaseId, schemaId, tableId, fieldId } = params;

  if (fieldId != null) {
    return `/admin/datamodel-v2/database/${databaseId}/schema/${schemaId}/table/${tableId}/field/${fieldId}`;
  }

  if (tableId != null) {
    return `/admin/datamodel-v2/database/${databaseId}/schema/${schemaId}/table/${tableId}`;
  }

  if (schemaId != null) {
    return `/admin/datamodel-v2/database/${databaseId}/schema/${schemaId}`;
  }

  if (databaseId != null) {
    return `/admin/datamodel-v2/database/${databaseId}`;
  }

  return `/admin/datamodel-v2`;
}
