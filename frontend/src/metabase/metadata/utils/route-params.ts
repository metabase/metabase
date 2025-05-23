import * as Urls from "metabase/lib/urls";
import type {
  DatabaseId,
  FieldId,
  SchemaName,
  TableId,
} from "metabase-types/api";

export type RouteParams = {
  databaseId?: string;
  fieldId?: string;
  schemaId?: string;
  tableId?: string;
};

export type ParsedRouteParams = {
  databaseId: DatabaseId | undefined;
  fieldId: FieldId | undefined;
  schemaId: SchemaName | undefined;
  tableId: TableId | undefined;
};

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
