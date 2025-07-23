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
  schemaId?: SchemaId;
  tableId?: string;
  fieldId?: string;
  sectionId?: string;
  transformId?: string;
};

export type ParsedRouteParams = {
  databaseId: DatabaseId | undefined;
  schemaName: SchemaName | undefined;
  tableId: TableId | undefined;
  fieldId: FieldId | undefined;
  sectionId: SectionId | undefined;
  transformId: TransformId | undefined;
};

export type SectionId = "transform";

export type Column = "nav" | "table" | "field" | "preview";

export interface ColumnSizeConfig {
  flex: number | string;
  min: number;
  max: number;
}
