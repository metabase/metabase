import { t } from "ttag";

import type {
  DimensionFilterValue,
  SerializedDimensionBreakout,
  SerializedFormulaEntity,
  SerializedMetricsViewerPageState,
  SerializedUrlFilter,
} from "metabase/common/metrics-viewer";
import {
  DEFAULT_DISPLAY_TYPE_BY_DIMENSION,
  getDimensionType,
} from "metabase/common/metrics/utils/dimension-types";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";
import type Question from "metabase-lib/v1/Question";
import type { Metric, MetricDimension, MetricId } from "metabase-types/api";

import type { SummaryBase, SummaryDefinition } from "../SummarySheet/types";
import { getSummaryBase } from "../SummarySheet/utils";

/** A table field, possibly reached through an implicit join (`sourceFieldId` is then the FK). */
export type CompareFieldRef = {
  fieldId: number;
  sourceFieldId: number | null;
};

export type CompareFilter = {
  field: CompareFieldRef;
  label: string;
  value: DimensionFilterValue;
};

/** What the compare sheet is seeded with, read off the data and summary tabs. */
export type CompareInput = {
  metricIds: MetricId[];
  filters: CompareFilter[];
  /** Filters on the data tab that can't be carried over, e.g. custom expressions. */
  unsupportedFilterLabels: string[];
  /** The summary's first grouping, e.g. a category; the chart is broken out by it when the metrics have it. */
  breakout: { field: CompareFieldRef; label: string } | null;
};

export type CompareSeed = {
  state: SerializedMetricsViewerPageState;
  /** Data tab filters that didn't match a dimension of every compared metric. */
  unmatchedFilterLabels: string[];
};

const COMPARE_TEMPORAL_UNIT = "month";
const PAST_YEAR_FILTER: DimensionFilterValue = {
  type: "relative-date",
  unit: "month",
  value: -12,
  offsetUnit: null,
  offsetValue: null,
  options: {},
};
// the metrics viewer's ids for the breakouts that combine one dimension per metric
const TIME_BREAKOUT_ID = "time";
const GEO_BREAKOUT_ID = "geo";

function parseFieldRef(ref: unknown): CompareFieldRef | null {
  if (!Array.isArray(ref) || ref[0] !== "field" || typeof ref[1] !== "number") {
    return null;
  }
  const options: unknown = ref[2];
  const sourceField =
    typeof options === "object" && options != null && "source-field" in options
      ? options["source-field"]
      : null;
  return {
    fieldId: ref[1],
    sourceFieldId: typeof sourceField === "number" ? sourceField : null,
  };
}

function getMetricId(
  { query, stageIndex }: SummaryBase,
  metric: Lib.MetricMetadata,
): MetricId | null {
  const ref: unknown = Lib.legacyRef(query, stageIndex, metric);
  return Array.isArray(ref) && ref[0] === "metric" && typeof ref[1] === "number"
    ? ref[1]
    : null;
}

type ParsedQueryFilter = {
  column: Lib.ColumnMetadata;
  value: DimensionFilterValue;
};

function parseQueryFilter(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
): ParsedQueryFilter | null {
  const stringParts = Lib.stringFilterParts(query, stageIndex, filter);
  if (stringParts) {
    const { column, operator, values, options } = stringParts;
    return { column, value: { type: "string", operator, values, options } };
  }
  const booleanParts = Lib.booleanFilterParts(query, stageIndex, filter);
  if (booleanParts) {
    const { column, operator, values } = booleanParts;
    return { column, value: { type: "boolean", operator, values } };
  }
  const numberParts = Lib.numberFilterParts(query, stageIndex, filter);
  if (numberParts) {
    const { column, operator, values } = numberParts;
    return { column, value: { type: "number", operator, values } };
  }
  const coordinateParts = Lib.coordinateFilterParts(query, stageIndex, filter);
  if (coordinateParts) {
    const { column, operator, values } = coordinateParts;
    return { column, value: { type: "coordinate", operator, values } };
  }
  const specificDateParts = Lib.specificDateFilterParts(
    query,
    stageIndex,
    filter,
  );
  if (specificDateParts) {
    const { column, operator, values, hasTime } = specificDateParts;
    return {
      column,
      value: { type: "specific-date", operator, values, hasTime },
    };
  }
  const relativeDateParts = Lib.relativeDateFilterParts(
    query,
    stageIndex,
    filter,
  );
  if (relativeDateParts) {
    const { column, unit, value, offsetUnit, offsetValue, options } =
      relativeDateParts;
    return {
      column,
      value: {
        type: "relative-date",
        unit,
        value,
        offsetUnit,
        offsetValue,
        options,
      },
    };
  }
  const excludeDateParts = Lib.excludeDateFilterParts(
    query,
    stageIndex,
    filter,
  );
  if (excludeDateParts) {
    const { column, operator, unit, values } = excludeDateParts;
    return { column, value: { type: "exclude-date", operator, unit, values } };
  }
  const timeParts = Lib.timeFilterParts(query, stageIndex, filter);
  if (timeParts) {
    const { column, operator, values } = timeParts;
    return { column, value: { type: "time", operator, values } };
  }
  const defaultParts = Lib.defaultFilterParts(query, stageIndex, filter);
  if (defaultParts) {
    const { column, operator } = defaultParts;
    return { column, value: { type: "default", operator } };
  }
  return null;
}

function getCompareFilters(
  query: Lib.Query,
  stageIndex: number,
): Pick<CompareInput, "filters" | "unsupportedFilterLabels"> {
  const filters: CompareFilter[] = [];
  const unsupportedFilterLabels: string[] = [];

  for (const filter of Lib.filters(query, stageIndex)) {
    const label = Lib.displayInfo(query, stageIndex, filter).displayName;
    const parsedFilter = parseQueryFilter(query, stageIndex, filter);
    const field = parsedFilter
      ? parseFieldRef(Lib.legacyRef(query, stageIndex, parsedFilter.column))
      : null;
    if (parsedFilter && field) {
      filters.push({ field, label, value: parsedFilter.value });
    } else {
      unsupportedFilterLabels.push(label);
    }
  }

  return { filters, unsupportedFilterLabels };
}

function getCompareMetricIds(
  base: SummaryBase,
  summaryDefinition: SummaryDefinition | undefined,
): MetricId[] {
  const summaryMetricIds = (summaryDefinition?.values ?? []).flatMap(
    (value) => {
      const metricId =
        value.type === "metric" ? getMetricId(base, value.metric) : null;
      return metricId != null ? [metricId] : [];
    },
  );
  if (summaryMetricIds.length > 0) {
    return [...new Set(summaryMetricIds)];
  }

  // without a summary, compare the table's first associated metric
  const [firstMetric] = Lib.availableMetrics(base.query, base.stageIndex);
  const firstMetricId = firstMetric ? getMetricId(base, firstMetric) : null;
  return firstMetricId != null ? [firstMetricId] : [];
}

function getSummaryBreakout(
  base: SummaryBase,
  summaryDefinition: SummaryDefinition | undefined,
): CompareInput["breakout"] {
  const [firstDimension] = summaryDefinition
    ? [...summaryDefinition.rows, ...summaryDefinition.columns]
    : [];
  const field = firstDimension
    ? parseFieldRef(
        Lib.legacyRef(base.query, base.stageIndex, firstDimension.column),
      )
    : null;
  return firstDimension && field
    ? {
        field,
        label: Lib.displayInfo(
          base.query,
          base.stageIndex,
          firstDimension.column,
        ).longDisplayName,
      }
    : null;
}

/** Reads the metrics, filters, and grouping to compare off the data and summary tabs. */
export function getCompareInput(
  question: Question,
  summaryDefinition: SummaryDefinition | undefined,
): CompareInput {
  const dataQuery = question.query();
  const base = getSummaryBase(dataQuery);
  return {
    metricIds: getCompareMetricIds(base, summaryDefinition),
    ...getCompareFilters(dataQuery, -1),
    breakout: getSummaryBreakout(base, summaryDefinition),
  };
}

/** Changes when the compare sheet should be re-seeded from the data and summary tabs. */
export function getCompareSeedKey(input: CompareInput): string {
  return JSON.stringify(
    [input.metricIds, input.filters, input.breakout],
    (_key, value) => (typeof value === "bigint" ? String(value) : value),
  );
}

function findDimension(
  metric: Metric,
  field: CompareFieldRef,
): MetricDimension | null {
  const dimensions = metric.dimensions ?? [];
  const mapping = metric.dimension_mappings?.find(({ target }) => {
    const [, options, fieldId] = target;
    return (
      fieldId === field.fieldId &&
      (field.sourceFieldId == null ||
        options["source-field"] === field.sourceFieldId)
    );
  });
  return (
    dimensions.find(({ id }) => id === mapping?.dimension_id) ??
    dimensions.find(({ sources }) =>
      sources?.some((source) => source["field-id"] === field.fieldId),
    ) ??
    null
  );
}

function isTimeDimension(dimension: MetricDimension): boolean {
  return LibMetric.isDateOrDateTime(LibMetric.fromMetricDimension(dimension));
}

function findDefaultTimeDimension(metric: Metric): MetricDimension | null {
  const timeDimensions = (metric.dimensions ?? []).filter(isTimeDimension);
  return (
    timeDimensions.find((dimension) => dimension.default) ??
    timeDimensions[0] ??
    null
  );
}

type BreakoutPlan = {
  breakout: Omit<SerializedDimensionBreakout, "definitions">;
  /** The dimension each metric is broken out by, in the order of the metrics. */
  dimensions: (MetricDimension | null)[];
};

/**
 * Breaks the chart out by the summary's grouping, e.g. a category, when the metrics have it.
 * Otherwise, or when the grouping is a date, it's by month over the past 12 months.
 */
function getBreakoutPlan(
  input: CompareInput,
  metrics: Metric[],
): BreakoutPlan | null {
  const summaryBreakout = input.breakout;
  const summaryDimensions = metrics.map((metric) =>
    summaryBreakout ? findDimension(metric, summaryBreakout.field) : null,
  );
  const summaryDimension = summaryDimensions.find(
    (dimension) => dimension != null,
  );
  const summaryDimensionType = summaryDimension
    ? getDimensionType(LibMetric.fromMetricDimension(summaryDimension))
    : null;

  if (
    summaryBreakout &&
    summaryDimension &&
    summaryDimensionType &&
    summaryDimensionType !== "time"
  ) {
    return {
      breakout: {
        id:
          summaryDimensionType === "geo"
            ? GEO_BREAKOUT_ID
            : summaryDimension.id,
        type: summaryDimensionType,
        label: summaryBreakout.label,
        display: DEFAULT_DISPLAY_TYPE_BY_DIMENSION[summaryDimensionType],
      },
      dimensions: summaryDimensions,
    };
  }

  const timeDimensions = metrics.map((metric, index) => {
    const dimension = summaryDimensions[index];
    return dimension && isTimeDimension(dimension)
      ? dimension
      : findDefaultTimeDimension(metric);
  });
  const timeDimension = timeDimensions.find((dimension) => dimension != null);
  if (!timeDimension) {
    return null;
  }
  return {
    breakout: {
      id: TIME_BREAKOUT_ID,
      type: "time",
      label: timeDimension.display_name,
      display: "line",
      projectionConfig: {
        temporalUnit: COMPARE_TEMPORAL_UNIT,
        dimensionFilter: PAST_YEAR_FILTER,
      },
    },
    dimensions: timeDimensions,
  };
}

function getFilteredSeriesName(metric: Metric, filterLabels: string[]) {
  const [firstLabel] = filterLabels;
  return filterLabels.length === 1 && firstLabel
    ? `${metric.name} · ${firstLabel}`
    : t`${metric.name} · ${filterLabels.length} filters`;
}

/**
 * The explorer state for comparing: per metric, a series narrowed down by the data tab's
 * filters next to the same metric across all the data, broken out like the summary.
 */
export function getCompareSeed(
  input: CompareInput,
  metrics: Metric[],
): CompareSeed {
  const plan = getBreakoutPlan(input, metrics);
  const formulaEntities: SerializedFormulaEntity[] = [];
  const breakoutDimensionIdBySlotIndex: (string | undefined)[] = [];
  const unmatchedFilterLabels = new Set<string>();

  metrics.forEach((metric, metricIndex) => {
    const breakoutDimensionId = plan?.dimensions[metricIndex]?.id;

    const filters: SerializedUrlFilter[] = [];
    const appliedFilterLabels: string[] = [];
    for (const filter of input.filters) {
      const dimension = findDimension(metric, filter.field);
      if (dimension == null) {
        unmatchedFilterLabels.add(filter.label);
      } else {
        filters.push({ dimensionId: dimension.id, value: filter.value });
        appliedFilterLabels.push(filter.label);
      }
    }

    if (filters.length > 0) {
      formulaEntities.push({
        type: "expression",
        id: `expression:compare-${metric.id}`,
        name: getFilteredSeriesName(metric, appliedFilterLabels),
        tokens: [{ type: "metric", sourceId: `metric:${metric.id}`, filters }],
      });
      breakoutDimensionIdBySlotIndex.push(breakoutDimensionId);
    }
    formulaEntities.push({ type: "metric", id: metric.id });
    breakoutDimensionIdBySlotIndex.push(breakoutDimensionId);
  });

  const breakout: SerializedDimensionBreakout | null = plan
    ? {
        ...plan.breakout,
        definitions: breakoutDimensionIdBySlotIndex.map(
          (dimensionId, slotIndex) => ({ slotIndex, dimensionId }),
        ),
      }
    : null;

  return {
    state: {
      formulaEntities,
      dimensionBreakouts: breakout ? [breakout] : [],
      selectedDimensionBreakoutId: breakout?.id ?? null,
    },
    unmatchedFilterLabels: [...unmatchedFilterLabels],
  };
}
