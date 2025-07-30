import type {
  DatabaseId,
  FieldId,
  SchemaId,
  SchemaName,
  TableId,
  TransformId,
} from "metabase-types/api";

export type RouteParams = {
  databaseId?: string;
  fieldId?: string;
  schemaId?: SchemaId;
  tableId?: string;
  transformId?: string;
};

export type ParsedRouteParams = {
  databaseId: DatabaseId | undefined;
  fieldId: FieldId | undefined;
  schemaName: SchemaName | undefined;
  tableId: TableId | undefined;
  transformId?: TransformId;
};

export type Column = "nav" | "table" | "field" | "preview";

export interface ColumnSizeConfig {
  flex: number | string;
  min: number;
  max: number;
}
