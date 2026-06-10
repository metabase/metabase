import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { QueryMetricResult } from "embedding-sdk-bundle/lib/query-metric";
import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type {
  InstanceFilter,
  JsMetricDefinition,
  MetricId,
  TypedProjection,
} from "metabase-types/api/metric";

import type {
  InferSchema,
  MetricDimensionSchema,
  MetricSchema,
  QueryData,
} from "../data-schema";
import { getSchemaId, mapRowsToObjects } from "../data-schema";

type Values<T> = T[keyof T];

type MetricFilterOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "between"
  | "contains"
  | "does-not-contain"
  | "starts-with"
  | "ends-with"
  | "is-empty"
  | "not-empty"
  | "is-null"
  | "not-null"
  | "time-interval";

type MetricDimensionName<TMetric> = TMetric extends {
  dimensions: infer TDimensions;
}
  ? NonNullable<TDimensions> extends readonly MetricDimensionSchema[]
    ? NonNullable<TDimensions>[number]["name"]
    : Values<NonNullable<TDimensions>> extends MetricDimensionSchema
      ? Values<NonNullable<TDimensions>>["name"]
      : string
  : string;

/**
 * @notExported MetricDimensionName
 * @notExported MetricDimensionSchema
 * @notExported MetricFilterOperator
 */
export type MetricFilter<TMetric = unknown> = {
  dimension: MetricDimensionName<TMetric> | MetricDimensionSchema;
  operator: MetricFilterOperator;
  value?: unknown;
  values?: readonly unknown[];
};

/**
 * @notExported MetricDimensionName
 * @notExported MetricDimensionSchema
 */
export type MetricBreakout<TMetric = unknown> =
  | MetricDimensionName<TMetric>
  | MetricDimensionSchema
  | {
      dimension: MetricDimensionName<TMetric> | MetricDimensionSchema;
      bucket?: string;
      binning?: {
        strategy: "default" | "bin-width" | "num-bins";
        "bin-width"?: number;
        "num-bins"?: number;
      };
    };

/** @notExported JsMetricDefinition */
export type UseMetricQueryOptions<TMetric = unknown> = {
  enabled?: boolean;
  definition?: JsMetricDefinition;
  filters?: readonly MetricFilter<TMetric>[];
  breakouts?: readonly MetricBreakout<TMetric>[];
};

/** @notExported InferSchema */
export type UseMetricQueryResult<TMetric = unknown> = {
  data: QueryData<InferSchema<TMetric, Record<string, unknown>>> | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<void>;
};

/**
 * Fetches the result of a metric through the metric dataset API.
 *
 * Passing a generated metric schema object enables row and dimension name
 * inference.
 *
 * @function
 * @category useMetricQuery
 */
export const useMetricQuery = <
  TMetric extends MetricSchema | MetricId = MetricId,
>(
  metric: TMetric | null,
  {
    enabled = true,
    definition,
    filters = [],
    breakouts = [],
  }: UseMetricQueryOptions<TMetric> = {},
): UseMetricQueryResult<TMetric> => {
  const {
    state: {
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();

  const loginStatus = useLazySelector(
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.getLoginStatus,
  );

  const queryMetric = getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.queryMetric;

  const metricId = getSchemaId(metric) as MetricId | null;
  const metricSchema = isMetricSchema(metric) ? metric : null;

  const [data, setData] = useState<UseMetricQueryResult<TMetric>["data"]>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const definitionKey = useMemo(
    () => JSON.stringify({ definition, filters, breakouts }),
    [definition, filters, breakouts],
  );

  const definitionRef = useRef<JsMetricDefinition | null>(null);

  useEffect(() => {
    definitionRef.current =
      definition ??
      buildMetricDefinition({
        metricId,
        metric: metricSchema,
        filters,
        breakouts,
      });
  }, [definition, metricId, metricSchema, definitionKey, filters, breakouts]);

  const refetch = useCallback(async () => {
    if (
      !enabled ||
      metricId == null ||
      !reduxStore ||
      !queryMetric ||
      !definitionRef.current
    ) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextResult = await queryMetric(reduxStore)({
        definition: definitionRef.current,
      });

      setData(mapMetricQueryData(nextResult));
    } catch (err) {
      setError(err);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, metricId, queryMetric, reduxStore]);

  useEffect(() => {
    if (loginStatus?.status === "success") {
      refetch();
    }
  }, [loginStatus?.status, definitionKey, refetch]);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
};

function buildMetricDefinition({
  metricId,
  metric,
  filters,
  breakouts,
}: {
  metricId: MetricId | null;
  metric: MetricSchema | null;
  filters: readonly MetricFilter[];
  breakouts: readonly MetricBreakout[];
}): JsMetricDefinition | null {
  if (metricId == null) {
    return null;
  }

  const uuid = "metric";
  const definition: JsMetricDefinition = {
    expression: ["metric", { "lib/uuid": uuid }, metricId],
  };

  const instanceFilters = filters.map((filter): InstanceFilter => {
    return {
      "lib/uuid": uuid,
      filter: buildFilterClause(metric, filter),
    };
  });

  if (instanceFilters.length > 0) {
    definition.filters = instanceFilters;
  }

  if (breakouts.length > 0) {
    definition.projections = [
      {
        type: "metric",
        id: metricId,
        "lib/uuid": uuid,
        projection: breakouts.map((breakout) =>
          buildBreakoutClause(metric, breakout),
        ),
      } satisfies TypedProjection,
    ];
  }

  return definition;
}

function buildFilterClause(metric: MetricSchema | null, filter: MetricFilter) {
  const operator = normalizeFilterOperator(filter.operator);
  const dimension = buildDimensionClause(metric, filter.dimension);
  const values = filter.values ?? [filter.value];

  if (operator === "between") {
    return [operator, {}, dimension, ...values.slice(0, 2)];
  }

  if (
    operator === "is-empty" ||
    operator === "not-empty" ||
    operator === "is-null" ||
    operator === "not-null"
  ) {
    return [operator, {}, dimension];
  }

  return [operator, {}, dimension, ...values];
}

function buildBreakoutClause(
  metric: MetricSchema | null,
  breakout: MetricBreakout,
) {
  if (typeof breakout === "string" || isMetricDimensionSchema(breakout)) {
    return buildDimensionClause(metric, breakout);
  }

  const options: Record<string, unknown> = {};

  if (breakout.bucket) {
    options["temporal-unit"] = breakout.bucket;
  }

  if (breakout.binning) {
    options.binning = breakout.binning;
  }

  return ["dimension", options, getDimensionId(metric, breakout.dimension)];
}

function buildDimensionClause(
  metric: MetricSchema | null,
  dimension: MetricDimensionName<unknown> | MetricDimensionSchema,
) {
  return ["dimension", {}, getDimensionId(metric, dimension)];
}

function getDimensionId(
  metric: MetricSchema | null,
  dimension: string | MetricDimensionSchema,
) {
  if (isMetricDimensionSchema(dimension)) {
    return dimension.id;
  }

  const schemaDimension = getMetricDimensions(metric).find(
    (candidate) => candidate.name === dimension,
  );

  return schemaDimension?.id ?? dimension;
}

function getMetricDimensions(
  metric: MetricSchema | null,
): MetricDimensionSchema[] {
  if (!metric?.dimensions) {
    return [];
  }

  return Array.isArray(metric.dimensions)
    ? [...metric.dimensions]
    : Object.values(metric.dimensions);
}

function normalizeFilterOperator(operator: MetricFilterOperator) {
  return operator === "=" ? "=" : operator;
}

function isMetricSchema(value: unknown): value is MetricSchema {
  return typeof value === "object" && value != null && "columns" in value;
}

function isMetricDimensionSchema(
  value: unknown,
): value is MetricDimensionSchema {
  return typeof value === "object" && value != null && "id" in value;
}

function mapMetricQueryData<TRow>(result: QueryMetricResult): QueryData<TRow> {
  return {
    ...result,
    rows: mapRowsToObjects<TRow>(result.columns, result.rows),
    rawRows: result.rows,
  };
}
