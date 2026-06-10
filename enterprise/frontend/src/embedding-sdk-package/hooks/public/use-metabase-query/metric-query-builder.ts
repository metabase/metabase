import type { MetricId } from "metabase-types/api";
import type {
  InstanceFilter,
  JsMetricDefinition,
  TypedProjection,
} from "metabase-types/api/metric";

import {
  getMetricId,
  isFieldSchema,
  isMeasureSchema,
  isMetricDimensionFilter,
  isMetricDimensionSchema,
  isSegmentSchema,
  isUnaryOperator,
} from "./guards";
import type {
  BreakoutObjectRuntime,
  MetricDimensionFilterRuntime,
  MetricQueryRuntime,
} from "./runtime-types";
import { validateMetricTableScopedInputs } from "./validation";

export function buildMetricDefinition(query: MetricQueryRuntime) {
  validateMetricTableScopedInputs(query);

  const metricId = Number(getMetricId(query)) as MetricId;
  const uuid = "metric";
  const definition: JsMetricDefinition = {
    expression: ["metric", { "lib/uuid": uuid }, metricId],
  };

  const filters = query.filters?.map((filter): InstanceFilter | null => {
    if (isSegmentSchema(filter)) {
      return {
        "lib/uuid": uuid,
        filter: ["segment", {}, filter.id],
      };
    }

    if (isMetricDimensionFilter(filter)) {
      return {
        "lib/uuid": uuid,
        filter: buildMetricFilterClause(filter),
      };
    }

    return null;
  });

  const compactFilters = filters?.filter(Boolean) as InstanceFilter[];

  if (compactFilters?.length) {
    definition.filters = compactFilters;
  }

  if (query.breakouts?.length) {
    definition.projections = [
      {
        type: "metric",
        id: metricId,
        "lib/uuid": uuid,
        projection: query.breakouts.map((breakout) => {
          return buildMetricBreakout(toMetricBreakout(breakout));
        }),
      } satisfies TypedProjection,
    ];
  }

  const measures = query.measures?.filter(isMeasureSchema);

  if (measures?.length) {
    definition.measures = measures.map((measure) => measure.id);
  }

  return definition;
}

function buildMetricFilterClause(filter: MetricDimensionFilterRuntime) {
  const operator = filter.operator;
  const dimension = buildMetricDimensionReference(filter.dimension);
  const values = filter.values ?? [filter.value];

  if (operator === "between") {
    return [operator, {}, dimension, ...values.slice(0, 2)];
  }

  if (isUnaryOperator(operator)) {
    return [operator, {}, dimension];
  }

  return [operator, {}, dimension, ...values];
}

function buildMetricBreakout(breakout: unknown) {
  const { dimension, options } = normalizeBreakout(breakout);

  return buildMetricDimensionReference(dimension, options);
}

function buildMetricDimensionReference(
  dimension: unknown,
  options: Record<string, unknown> = {},
) {
  if (typeof dimension === "string") {
    throw new Error(
      "Metric query dimensions must use generated metric dimension objects, not dimension name strings.",
    );
  }

  return [
    "dimension",
    options,
    isFieldSchema(dimension) ? dimension.id : dimension,
  ];
}

function normalizeBreakout(breakout: unknown) {
  if (
    typeof breakout === "string" ||
    isFieldSchema(breakout) ||
    isMetricDimensionSchema(breakout)
  ) {
    return { dimension: breakout, options: {} };
  }

  if (!isBreakoutObject(breakout)) {
    throw new Error(
      "Metric query breakouts must use generated metric dimension objects, not dimension name strings.",
    );
  }

  const options: Record<string, unknown> = {};

  if (breakout.bucket) {
    options["temporal-unit"] = breakout.bucket;
  }

  if (breakout.binning) {
    options.binning = breakout.binning;
  }

  return { dimension: breakout.dimension, options };
}

function toMetricBreakout(breakout: unknown) {
  if (isMetricDimensionSchema(breakout)) {
    return breakout;
  }

  if (
    typeof breakout === "object" &&
    breakout != null &&
    "dimension" in breakout &&
    isMetricDimensionSchema(breakout.dimension)
  ) {
    return breakout as BreakoutObjectRuntime;
  }

  throw new Error(
    "Metric query breakouts must use generated metric dimension objects, not dimension name strings.",
  );
}

function isBreakoutObject(value: unknown): value is BreakoutObjectRuntime {
  return typeof value === "object" && value != null && "dimension" in value;
}
