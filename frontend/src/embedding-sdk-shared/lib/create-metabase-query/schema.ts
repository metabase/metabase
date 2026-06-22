export type SchemaJavaScriptType =
  | "string"
  | "number"
  | "boolean"
  | "Date"
  | "unknown";

export type SchemaColumn = {
  name: string;
  description?: string;
  displayName?: string;
  jsType?: SchemaJavaScriptType;
  baseType?: string;
  effectiveType?: string;
};

export type SchemaParameter = {
  slug: string;
  type?: string;
};

export type QuestionSchema<TQuestionId = string | number> = {
  id: TQuestionId;
  columns: readonly SchemaColumn[];
  parameters?: readonly SchemaParameter[];
};

/**
 * Metadata for a generated table field or metric dimension.
 */
export type FieldSchema = SchemaColumn & {
  id?: string | number;
  fieldId?: number;
  tableId?: number;
  sourceFieldId?: number;
};

export type SegmentSchema<TTableId extends number = number> = {
  kind: "segment";
  id: number;
  tableId: TTableId;
};

export type MeasureSchema<TTableId extends number = number> = {
  kind: "measure";
  id: number;
  tableId: TTableId;
  columns: readonly SchemaColumn[];
};

export type TableSchema = {
  id: number;
  databaseId: number;
  columns?: readonly SchemaColumn[];
  fields?: Record<string, FieldSchema>;
  segments?: Record<string, SegmentSchema>;
  measures?: Record<string, MeasureSchema>;
};

export type MetricSchema = {
  id: number;
  databaseId?: number;
  sourceTableId?: number;
  sourceCardId?: number;
  columns: readonly SchemaColumn[];
  mappedTableIds?: readonly number[];
  dimensions?: Record<string, Record<string, FieldSchema>>;
};
