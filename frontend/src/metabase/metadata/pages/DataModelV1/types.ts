import type {
  DatabaseId,
  FieldId,
  SchemaId,
  SchemaName,
  TableId,
} from "metabase-types/api";

export type RouteParams = {
  databaseId?: string;
  fieldId?: string;
  schemaId?: SchemaId;
  tableId?: string;
};

export type ParsedRouteParams = {
  databaseId: DatabaseId | undefined;
  fieldId?: FieldId;
  schemaName: SchemaName | undefined;
  tableId: TableId | undefined;
};

export type Column = "nav" | "table" | "field" | "preview";

export interface ColumnSizeConfig {
  flex: number | string;
  min: number;
  max: number;
}
