import { skipToken } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { GetTableQueryMetadataRequest, TableId } from "metabase-types/api";

import type { ParsedRouteParams, RouteParams } from "./types";

export function parseRouteParams(params: RouteParams): ParsedRouteParams {
  return {
    databaseId: Urls.extractEntityId(params.databaseId),
    schemaId: params.schemaId?.replace(/^\d+:/, ""),
    tableId: Urls.extractEntityId(params.tableId),
    fieldId: Urls.extractEntityId(params.fieldId),
  };
}

export function getUrl(params: ParsedRouteParams): string {
  const { databaseId, schemaId, tableId, fieldId } = params;

  if (
    databaseId != null &&
    schemaId != null &&
    tableId != null &&
    fieldId != null
  ) {
    return `/admin/datamodel/database/${databaseId}/schema/${databaseId}:${schemaId}/table/${tableId}/field/${fieldId}`;
  }

  if (databaseId != null && schemaId != null && tableId != null) {
    return `/admin/datamodel/database/${databaseId}/schema/${databaseId}:${schemaId}/table/${tableId}`;
  }

  if (databaseId != null && schemaId != null) {
    return `/admin/datamodel/database/${databaseId}/schema/${databaseId}:${schemaId}`;
  }

  if (databaseId != null) {
    return `/admin/datamodel/database/${databaseId}`;
  }

  return `/admin/datamodel`;
}

export function getTableMetadataQuery(
  tableId: TableId | undefined,
): GetTableQueryMetadataRequest | typeof skipToken {
  if (tableId == null) {
    return skipToken;
  }

  return {
    id: tableId,
    include_sensitive_fields: true,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  };
}

export function clamp(
  value: number,
  { min, max }: { min: number; max: number },
): number {
  return Math.max(min, Math.min(max, value));
}
