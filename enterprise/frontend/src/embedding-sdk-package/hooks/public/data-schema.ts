import type { QueryQuestionResult } from "embedding-sdk-bundle/lib/query-question";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

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
};

export type SchemaParameter = {
  slug: string;
  type?: string;
};

export type QuestionSchema = {
  id: QueryQuestionResult["id"];
  columns: readonly SchemaColumn[];
  parameters?: readonly SchemaParameter[];
};

export type MetricDimensionSchema = SchemaColumn & {
  id: string | number;
  tableId?: number;
  fieldId?: number;
};

export type FieldSchema = SchemaColumn & {
  id: string | number;
  fieldId?: number;
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
  columns: readonly SchemaColumn[];
  mappedTableIds?: readonly number[];
  dimensions?: Record<string, MetricDimensionSchema>;
};

export type SchemaValue<TColumn extends SchemaColumn> =
  TColumn["jsType"] extends "string"
    ? string | null
    : TColumn["jsType"] extends "number"
      ? number | null
      : TColumn["jsType"] extends "boolean"
        ? boolean | null
        : TColumn["jsType"] extends "Date"
          ? string | Date | null
          : RowValue | null;

/** @notExported SchemaValue */
export type SchemaRow<TSchema extends { columns: readonly SchemaColumn[] }> = {
  [TColumn in TSchema["columns"][number] as TColumn["name"]]: SchemaValue<TColumn>;
};

/**
 * @notExported DatasetColumn
 * @notExported RowValues
 */
export type QueryData<TRow> = {
  id?: QueryQuestionResult["id"] | null;
  name?: QueryQuestionResult["name"] | null;
  description?: QueryQuestionResult["description"];
  entityId?: QueryQuestionResult["entityId"] | null;
  rowCount: number | null;
  runningTime: number | null;
  columns: DatasetColumn[];
  rows: TRow[];
  rawRows: RowValues[];
};

export type InferSchema<TSchema, TFallback> = TSchema extends {
  columns: readonly SchemaColumn[];
}
  ? SchemaRow<TSchema>
  : TFallback;

export function getSchemaId<TEntity extends { id: unknown }>(
  entity: TEntity | TEntity["id"] | null,
): TEntity["id"] | null {
  if (entity == null) {
    return null;
  }

  if (typeof entity === "object" && "id" in entity) {
    return entity.id as TEntity["id"];
  }

  return entity as TEntity["id"];
}

export function mapRowsToObjects<TRow>(
  columns: DatasetColumn[],
  rows: RowValues[],
): TRow[] {
  return rows.map((row) => {
    return columns.reduce<Record<string, RowValue>>((acc, column, index) => {
      const key = column.name || column.display_name || `column_${index}`;
      acc[key] = row[index];
      return acc;
    }, {}) as TRow;
  });
}

export function mapQueryData<TRow>(
  result: QueryQuestionResult,
): QueryData<TRow> {
  const rawRows = result.rows;

  return {
    ...result,
    rows: mapRowsToObjects<TRow>(result.columns, rawRows),
    rawRows,
  };
}
