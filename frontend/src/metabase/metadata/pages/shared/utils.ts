import { skipToken } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";
import type { GetTableQueryMetadataRequest, TableId } from "metabase-types/api";

import type { ParsedRouteParams, RouteParams } from "../DataModelV1/types";

export function parseRouteParams(params: RouteParams): ParsedRouteParams {
  return {
    databaseId: Urls.extractEntityId(params.databaseId),
    schemaName: params.schemaId
      ? getSchemaName(params.schemaId)
      : params.schemaId,
    tableId: Urls.extractEntityId(params.tableId),
    fieldId: Urls.extractEntityId(params.fieldId),
  };
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
