import type { MetadataProvider, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { Field } from "metabase-types/api/field";
import type {
  AdhocDimension,
  AdhocLeafDefinition,
  JsMetricDefinition,
} from "metabase-types/api/metric";

export type AdhocAggregationOperator =
  | "count"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "distinct";

export type AdhocConfig = {
  uuid: string;
  databaseId: number;
  tableId: number;
  tableName: string;
  aggregationOperator: AdhocAggregationOperator;
  /** The field to aggregate (null for count) */
  column?: Field;
  displayName: string;
};

/**
 * Build the dimensions array from all breakout-eligible fields on the table.
 * Each dimension gets a stable UUID as its ID (required by the CLJS schema).
 * Field-refs include lib/uuid as required by the MBQL field clause schema.
 */
export function buildAdhocDimensions(
  tableId: number,
  fields: Field[],
): AdhocDimension[] {
  return fields
    .filter(
      (field) =>
        field.active &&
        field.visibility_type === "normal" &&
        field.id != null &&
        typeof field.id === "number",
    )
    .map((field) => {
      const fieldId = field.id as number;
      const dimension: AdhocDimension = {
        id: crypto.randomUUID(),
        "field-ref": [
          "field",
          { "lib/uuid": crypto.randomUUID(), "table-id": tableId },
          fieldId,
        ],
        "display-name": field.display_name,
        "effective-type": field.effective_type ?? field.base_type,
      };
      if (field.semantic_type) {
        dimension["semantic-type"] = field.semantic_type;
      }
      return dimension;
    });
}

/**
 * Build the MBQL aggregation clause for the given operator and optional column.
 */
export function buildAdhocAggregation(
  operator: AdhocAggregationOperator,
  tableId: number,
  column?: Field,
): unknown {
  if (operator === "count") {
    return ["count", {}];
  }

  if (!column || typeof column.id !== "number") {
    throw new Error(`Aggregation "${operator}" requires a column`);
  }

  return [
    operator,
    {},
    [
      "field",
      { "lib/uuid": crypto.randomUUID(), "table-id": tableId },
      column.id,
    ],
  ];
}

/**
 * Build the full inline definition for an adhoc expression leaf.
 */
export function buildAdhocLeafDefinition(
  config: AdhocConfig,
  fields: Field[],
): AdhocLeafDefinition {
  return {
    "database-id": config.databaseId,
    "table-id": config.tableId,
    aggregation: buildAdhocAggregation(
      config.aggregationOperator,
      config.tableId,
      config.column,
    ),
    dimensions: buildAdhocDimensions(config.tableId, fields),
  };
}

/**
 * Build a full MetricDefinition for an adhoc leaf, using the CLJS lib.
 * This produces an opaque MetricDefinition that works with all the existing
 * dimension, projection, and filter infrastructure.
 */
export function buildAdhocMetricDefinition(
  config: AdhocConfig,
  fields: Field[],
  metadataProvider: MetadataProvider,
): MetricDefinition {
  const leafDefinition = buildAdhocLeafDefinition(config, fields);

  const jsDef: JsMetricDefinition = {
    expression: ["adhoc", { "lib/uuid": config.uuid }, leafDefinition],
  };

  return LibMetric.fromJsMetricDefinition(metadataProvider, jsDef);
}

/**
 * Build a display name for an adhoc aggregation.
 * e.g. "Count of rows (Sales Transactions)" or "Sum of Tax (Sales Transactions)"
 */
export function buildAdhocDisplayName(
  operator: AdhocAggregationOperator,
  tableName: string,
  columnName?: string,
): string {
  const OPERATOR_LABELS: Record<AdhocAggregationOperator, string> = {
    count: "Count of rows",
    sum: "Sum",
    avg: "Average",
    min: "Min",
    max: "Max",
    distinct: "Distinct values",
  };

  const opLabel = OPERATOR_LABELS[operator];
  if (operator === "count") {
    return `${opLabel} (${tableName})`;
  }

  if (columnName) {
    return `${opLabel} of ${columnName} (${tableName})`;
  }

  return `${opLabel} (${tableName})`;
}
