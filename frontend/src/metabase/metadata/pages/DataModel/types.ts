import type {
  DatabaseId,
  FieldId,
  SchemaName,
  TableId,
} from "metabase-types/api";

export interface RouteParams {
  databaseId?: string;
  fieldId?: string;
  schemaId?: string;
  tableId?: string;
}

export interface ParsedRouteParams {
  databaseId: DatabaseId | undefined;
  fieldId: FieldId | undefined;
  schemaId: SchemaName | undefined;
  tableId: TableId | undefined;
}
