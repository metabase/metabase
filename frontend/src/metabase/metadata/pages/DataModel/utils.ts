import { skipToken } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { GetTableQueryMetadataRequest, TableId } from "metabase-types/api";

import { COLUMN_CONFIG } from "./constants";
import type { ColumnSizeConfig, ParsedRouteParams, RouteParams } from "./types";

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
    return `/admin/datamodel/database/${databaseId}/schema/${databaseId}:${encodeURIComponent(schemaId)}/table/${tableId}/field/${fieldId}`;
  }

  if (databaseId != null && schemaId != null && tableId != null) {
    return `/admin/datamodel/database/${databaseId}/schema/${databaseId}:${encodeURIComponent(schemaId)}/table/${tableId}`;
  }

  if (databaseId != null && schemaId != null) {
    return `/admin/datamodel/database/${databaseId}/schema/${databaseId}:${encodeURIComponent(schemaId)}`;
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

export function getFieldConfig({
  isPreviewOpen,
  fieldWidth,
  previewWidth,
}: {
  isPreviewOpen: boolean;
  fieldWidth: number;
  previewWidth: number;
}): ColumnSizeConfig {
  return {
    initial: fieldWidth + (isPreviewOpen ? previewWidth : 0),
    max: COLUMN_CONFIG.field.max + (isPreviewOpen ? previewWidth : 0),
    min:
      COLUMN_CONFIG.field.min + (isPreviewOpen ? COLUMN_CONFIG.preview.min : 0),
  };
}

export function getPreviewConfig({
  isPreviewOpen,
  fieldWidth,
  previewWidth,
}: {
  isPreviewOpen: boolean;
  fieldWidth: number;
  previewWidth: number;
}): ColumnSizeConfig {
  return {
    initial: isPreviewOpen ? previewWidth : 0,
    max: Math.min(
      COLUMN_CONFIG.preview.max,
      fieldWidth - COLUMN_CONFIG.field.min,
    ),
    min: Math.max(
      COLUMN_CONFIG.preview.min,
      fieldWidth - COLUMN_CONFIG.field.max,
    ),
  };
}
