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

export type FieldSchema = SchemaColumn & {
  id?: string | number;
  fieldId?: number;
  tableId?: number;
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
