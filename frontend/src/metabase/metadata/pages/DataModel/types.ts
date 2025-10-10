import type {
  CardId,
  DatabaseId,
  Field,
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

  modelId?: string;
  fieldName?: string;
};

export type ParsedRouteParams = {
  databaseId: DatabaseId | undefined;
  fieldId: FieldId | undefined;
  schemaName: SchemaName | undefined;
  tableId: TableId | undefined;
  modelId: CardId | undefined;
  fieldName: string | undefined;
};

export type Column = "nav" | "table" | "field" | "preview";

export interface ColumnSizeConfig {
  flex: number | string;
  min: number;
  max: number;
}

export type MetadataEditAnalyticsDetail =
  | "type_casting"
  | "semantic_type_change"
  | "visibility_change"
  | "filtering_change"
  | "display_values"
  | "json_unfolding"
  | "formatting";

export type MetadataEditMode = "table" | "model";

export type FieldChangeParams = Partial<Field>;
