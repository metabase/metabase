export type SchemaJavaScriptType =
  | "string"
  | "number"
  | "boolean"
  | "Date"
  | "unknown";

export type SchemaColumn = {
  type?: "column";
  name: string;
  description?: string;
  displayName?: string;
  jsType?: SchemaJavaScriptType;
  baseType?: string;
  effectiveType?: string;
};

/**
 * Metadata for a generated table field.
 */
export type FieldSchema = SchemaColumn & {
  type: "column";
  id?: string | number;
  sourceName?: string;
  fieldId?: number;
  tableId?: number;
  sourceFieldId?: number;
};

export type SegmentSchema<TTableId extends number = number> = {
  type: "segment";
  id: number;
  tableId: TTableId;
};

export type MeasureSchema<TTableId extends number = number> = {
  type: "measure";
  id: number;
  tableId: TTableId;
  columns: readonly SchemaColumn[];
};

export type TableSchema = {
  type: "table";
  id: number;
  columns?: readonly SchemaColumn[];
  fields?: Record<string, FieldSchema>;
  segments?: Record<string, SegmentSchema>;
  measures?: Record<string, MeasureSchema>;
};

export type MetricSchema = {
  type: "metric";
  id: number;
  databaseId?: number;
  sourceTableId?: number;
  sourceCardId?: number;
  mappedTableIds?: readonly number[];
  columns?: readonly SchemaColumn[];
  dimensions?: Record<string, Record<string, FieldSchema>>;
};

export type QuestionSchema = {
  type: "card";
  id: number;
  name?: string;
  display?: string;
  columns?: readonly SchemaColumn[];
};
