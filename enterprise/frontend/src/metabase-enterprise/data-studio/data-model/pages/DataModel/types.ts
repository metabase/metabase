import type {
  DatabaseId,
  FieldId,
  SchemaId,
  SchemaName,
  TableId,
} from "metabase-types/api";

export type RouteParams = {
  databaseId?: string;
  schemaId?: SchemaId;
  tableId?: string;
  fieldId?: string;
};

export type ParsedRouteParams = {
  databaseId: DatabaseId | undefined;
  schemaName: SchemaName | undefined;
  tableId: TableId | undefined;
  fieldId?: FieldId;
};

export type Column = "nav" | "table" | "field" | "preview";

export interface ColumnSizeConfig {
  flex: number | string;
  min: number;
  max: number | string;
}

export type MetadataEditAnalyticsDetail =
  | "type_casting"
  | "semantic_type_change"
  | "visibility_change"
  | "filtering_change"
  | "display_values"
  | "json_unfolding"
  | "formatting";
