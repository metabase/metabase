import { match } from "ts-pattern";

import type { DimensionDescriptor } from "metabase/common/metrics/utils/dimension-descriptors";
import { getDimensionDescriptors } from "metabase/common/metrics/utils/dimension-descriptors";
import * as Lib from "metabase-lib";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  ConcreteTableId,
  Field,
  FieldId,
  Measure,
  MeasureId,
  Table,
} from "metabase-types/api";

import type {
  CubeCatalog,
  CubeDimension,
  CubeDimensionKey,
  CubeMeasure,
  CubeSegment,
} from "../generators/types";

const STAGE_INDEX = -1;

const ADDITIVE_OPERATORS = new Set(["count", "sum", "cum-count", "cum-sum"]);

/** Category dimensions with more distinct values than this are penalized. */
const HIGH_CARDINALITY_THRESHOLD = 100;
const HIGH_CARDINALITY_PENALTY = 0.5;

export interface BuildCubeCatalogArgs {
  tableId: ConcreteTableId;
  /** The `query_metadata` response: needs `fields` and `segments`. */
  table: Table;
  /** Measures loaded via `GET /api/measure/:id`, so their dimensions are synced. */
  measures: Measure[];
  definitions: Map<MeasureId, MetricDefinition>;
  /** Backs `Lib.fromJsQueryAndMetadata` for reading each measure's aggregation. */
  metadata: Metadata;
}

export function getCubeDimensionKey(fieldId: FieldId): CubeDimensionKey {
  return `field:${fieldId}`;
}

export function buildCubeCatalog({
  tableId,
  table,
  measures,
  definitions,
  metadata,
}: BuildCubeCatalogArgs): CubeCatalog {
  const fieldsById = new Map<FieldId, Field>(
    (table.fields ?? []).flatMap((field): [FieldId, Field][] =>
      typeof field.id === "number" ? [[field.id, field]] : [],
    ),
  );
  const dimensionsByKey = new Map<CubeDimensionKey, CubeDimension>();
  const cubeMeasures: CubeMeasure[] = [];

  for (const measure of measures) {
    const definition = definitions.get(measure.id);
    if (!definition) {
      continue;
    }

    const { isAdditive, aggregatedFieldId } = getMeasureAggregationInfo(
      metadata,
      measure,
    );
    const dimensionIds: CubeMeasure["dimensionIds"] = {};

    for (const descriptor of getDimensionDescriptors(definition).values()) {
      const fieldId = getDescriptorFieldId(descriptor);
      if (fieldId == null || fieldId === aggregatedFieldId) {
        continue;
      }

      const key = getCubeDimensionKey(fieldId);
      dimensionIds[key] = descriptor.id;

      if (!dimensionsByKey.has(key)) {
        dimensionsByKey.set(
          key,
          buildCubeDimension(key, descriptor, fieldsById.get(fieldId)),
        );
      }
    }

    cubeMeasures.push({
      id: measure.id,
      name: measure.name,
      isAdditive,
      dimensionIds,
    });
  }

  return {
    tableId,
    measures: cubeMeasures.sort((a, b) => a.name.localeCompare(b.name)),
    dimensions: [...dimensionsByKey.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
    segments: buildCubeSegments(table),
  };
}

/** Joined-table dimensions are excluded in v1; we only key on the main table's field ids. */
function getDescriptorFieldId(descriptor: DimensionDescriptor): FieldId | null {
  if (descriptor.group?.type === "connection") {
    return null;
  }
  const metricDimension = LibMetric.toMetricDimension(
    descriptor.dimensionMetadata,
  );
  const fieldSource = metricDimension.sources?.find(
    (source) => source.type === "field",
  );
  return fieldSource?.["field-id"] ?? null;
}

function buildCubeDimension(
  key: CubeDimensionKey,
  descriptor: DimensionDescriptor,
  field: Field | undefined,
): CubeDimension {
  const distinctCount = field?.fingerprint?.global?.["distinct-count"] ?? null;
  return {
    key,
    label: descriptor.displayName,
    type: descriptor.dimensionType,
    score: getDimensionScore(descriptor, field, distinctCount),
    distinctCount,
    canListValues: descriptor.canListValues,
  };
}

function getDimensionScore(
  descriptor: DimensionDescriptor,
  field: Field | undefined,
  distinctCount: number | null,
): number {
  const score =
    field?.dimension_interestingness ?? getFallbackScore(descriptor, field);
  const isHighCardinalityCategory =
    descriptor.dimensionType === "category" &&
    distinctCount != null &&
    distinctCount > HIGH_CARDINALITY_THRESHOLD;
  return isHighCardinalityCategory ? score * HIGH_CARDINALITY_PENALTY : score;
}

/** Used for tables that haven't been analyzed for interestingness yet. */
function getFallbackScore(
  descriptor: DimensionDescriptor,
  field: Field | undefined,
): number {
  return match(descriptor.dimensionType)
    .with("time", () =>
      field?.semantic_type === "type/CreationTimestamp" ? 0.8 : 0.6,
    )
    .with("geo", () => 0.6)
    .with("category", () => {
      if (!descriptor.canListValues) {
        return 0.35;
      }
      return descriptor.isPreferred ? 0.6 : 0.5;
    })
    .with("boolean", () => 0.4)
    .with("numeric", () => 0.3)
    .exhaustive();
}

interface MeasureAggregationInfo {
  isAdditive: boolean;
  /** The field the measure aggregates over, when the aggregation picks a column. */
  aggregatedFieldId: FieldId | null;
}

/**
 * A measure definition has exactly one aggregation. Aggregations built from a
 * custom expression have no selected operator and count as not additive.
 */
export function getMeasureAggregationInfo(
  metadata: Metadata,
  measure: Measure,
): MeasureAggregationInfo {
  const query = Lib.fromJsQueryAndMetadata(metadata, measure.definition);
  const [clause] = Lib.aggregations(query, STAGE_INDEX);
  if (!clause) {
    return { isAdditive: false, aggregatedFieldId: null };
  }

  const operators = Lib.selectedAggregationOperators(
    Lib.availableAggregationOperators(query, STAGE_INDEX),
    clause,
  );
  const selectedOperator = operators.find(
    (operator) => Lib.displayInfo(query, STAGE_INDEX, operator).selected,
  );
  if (!selectedOperator) {
    return { isAdditive: false, aggregatedFieldId: null };
  }

  const { shortName } = Lib.displayInfo(query, STAGE_INDEX, selectedOperator);
  const selectedColumn = Lib.aggregationOperatorColumns(selectedOperator).find(
    (column) => Lib.displayInfo(query, STAGE_INDEX, column).selected,
  );

  return {
    isAdditive: ADDITIVE_OPERATORS.has(shortName),
    aggregatedFieldId: selectedColumn
      ? Lib.fieldValuesSearchInfo(query, selectedColumn).fieldId
      : null,
  };
}

function buildCubeSegments(table: Table): CubeSegment[] {
  return (table.segments ?? [])
    .filter((segment) => !segment.archived)
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
