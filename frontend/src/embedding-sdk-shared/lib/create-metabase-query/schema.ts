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
};

/**
 * Metadata for a generated table field.
 */
export type FieldSchema = SchemaColumn & {
  type: "column";
  id?: string | number;
  fieldId?: number;
  tableId?: number;
  sourceFieldId?: number;
};

export type TableFieldSchema = FieldSchema & {
  slug: string;
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
  fields?: Record<string, TableFieldSchema>;
  segments?: Record<string, SegmentSchema>;
  measures?: Record<string, MeasureSchema>;
};

export type MetricSchema = {
  type: "metric";
  id: number;
  sourceTableId?: number;
  sourceCardId?: number;
  mappedTableIds?: readonly number[];
  columns?: readonly SchemaColumn[];
  dimensions?: Record<string, Record<string, FieldSchema>>;
};

/**
 * A saved question, by its id or by its entity ID.
 */
export type QuestionSchema = {
  type: "card";
  name?: string;
  display?: string;
  columns?: readonly SchemaColumn[];
} & ({ id: number; entityId?: string } | { id?: never; entityId: string });
