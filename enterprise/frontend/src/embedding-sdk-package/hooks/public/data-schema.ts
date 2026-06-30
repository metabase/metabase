import type { QueryQuestionResult } from "embedding-sdk-bundle/lib/query-question";
import type {
  FieldSchema,
  MeasureSchema,
  SchemaColumn,
  SchemaJavaScriptType,
  SegmentSchema,
  TableSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { DatasetColumn, RowValues } from "metabase-types/api";

export type {
  FieldSchema,
  MeasureSchema,
  SchemaColumn,
  SchemaJavaScriptType,
  SegmentSchema,
  TableSchema,
};

/**
 * A single value returned by Metabase query results or action responses.
 */
export type RowValue = string | number | null | boolean | object;

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
