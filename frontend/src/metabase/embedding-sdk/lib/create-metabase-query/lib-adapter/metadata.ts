import type {
  FieldSchema,
  MeasureSchema,
  SchemaJavaScriptType,
  SegmentSchema,
  TableSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { Metadata as MetadataInput } from "metabase-lib";
import { TYPE } from "metabase-lib/v1/types/constants";
import type { TableId } from "metabase-types/api";

type TableMetadataSource = Omit<TableSchema, "id"> & { id: TableId };

const JAVASCRIPT_TYPE_BASE_TYPES: Partial<
  Record<SchemaJavaScriptType, string>
> = { number: TYPE.Float, boolean: TYPE.Boolean, Date: TYPE.DateTime };

/*
 * TODO(EMB-1947): Replace this temporary fake metadata adapter hack with
 * actually loading the query metadata at runtime, before expanding the table query DSL further.
 */

export function createTableMetadata(
  table: TableMetadataSource,
  databaseId: number,
): MetadataInput {
  const fields = Object.values(table.fields ?? {}).filter(hasFieldReferenceId);
  const segments = Object.values(table.segments ?? {});
  const measures = Object.values(table.measures ?? {});

  return {
    databases: { [databaseId]: createDatabaseMetadata(databaseId) },
    tables: { [table.id]: createTableMetadataRecord(table, databaseId) },
    fields: Object.fromEntries(
      fields.map((field, index) => [
        getFieldId(field),
        createFieldMetadataRecord(field, table.id, index),
      ]),
    ),
    segments: Object.fromEntries(
      segments.map((segment) => [
        segment.id,
        createSegmentMetadataRecord(segment, table.id),
      ]),
    ),
    measures: Object.fromEntries(
      measures.map((measure) => [
        measure.id,
        createMeasureMetadataRecord(measure, table.id, databaseId),
      ]),
    ),
  };
}

const createDatabaseMetadata = (databaseId: number) => ({
  id: databaseId,
  name: `Database ${databaseId}`,
  features: ["basic-aggregations", "binning", "expressions"],
});

const createTableMetadataRecord = (
  table: TableMetadataSource,
  databaseId: number,
) => ({
  id: table.id,
  db_id: databaseId,
  display_name: `Table ${table.id}`,
  name: `table_${table.id}`,
});

const createFieldMetadataRecord = (
  field: FieldSchema,
  tableId: TableId,
  index: number,
) => ({
  id: getFieldId(field) ?? index,
  table_id: tableId,
  name: field.name,
  display_name: field.displayName ?? field.name,
  description: field.description ?? null,
  base_type: getFieldBaseType(field),
  effective_type: getFieldEffectiveType(field),
  position: index,
});

const createSegmentMetadataRecord = (
  segment: SegmentSchema,
  tableId: TableId,
) => ({
  ...segment,
  name: `Segment ${segment.id}`,
  table_id: segment.tableId ?? tableId,
});

const createMeasureMetadataRecord = (
  measure: MeasureSchema,
  tableId: TableId,
  databaseId: number,
) => ({
  ...measure,
  name: `Measure ${measure.id}`,
  table_id: measure.tableId ?? tableId,
  definition: {
    type: "query",
    database: databaseId,
    query: {
      "source-table": measure.tableId ?? tableId,
      aggregation: [["count"]],
    },
  },
});

const hasFieldReferenceId = (field: FieldSchema): boolean =>
  getFieldId(field) !== null;

const getBaseType = (jsType?: SchemaJavaScriptType): string =>
  jsType != null && jsType in JAVASCRIPT_TYPE_BASE_TYPES
    ? (JAVASCRIPT_TYPE_BASE_TYPES[jsType] ?? TYPE.Text)
    : TYPE.Text;

const getFieldBaseType = (field: FieldSchema): string =>
  field.baseType ?? getBaseType(field.jsType);

const getFieldEffectiveType = (field: FieldSchema): string =>
  field.effectiveType ?? getFieldBaseType(field);

function getFieldId(field: FieldSchema): number | null {
  if (typeof field.fieldId === "number") {
    return field.fieldId;
  }

  if (typeof field.id === "number") {
    return field.id;
  }

  return null;
}
