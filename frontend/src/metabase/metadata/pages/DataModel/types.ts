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

export type Column = "nav" | "table" | "field" | "preview";

export interface ColumnSizeConfig {
  initial: number;
  min: number;
  max: number;
}
