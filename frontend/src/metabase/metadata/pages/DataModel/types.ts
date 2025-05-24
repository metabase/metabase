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
