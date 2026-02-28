import dayjs from "dayjs";
import { match } from "ts-pattern";

import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { PLUGIN_AI_ENTITY_ANALYSIS, PLUGIN_METABOT } from "metabase/plugins";
import {
  getChartImagePngDataUri,
  getChartSelector,
  getVisualizationSvgDataUri,
} from "metabase/visualizations/lib/image-exports";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import {
  findAnotherColumnValue,
  findPreviousValue,
  findStaticNumberValue,
} from "metabase/visualizations/visualizations/SmartScalar/compute";
import { COMPARISON_TYPES } from "metabase/visualizations/visualizations/SmartScalar/constants";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  CardDisplayType,
  MetabotChartConfig,
  MetabotColumnType,
  MetabotDisplayType,
  MetabotSeriesConfig,
  RawSeries,
  TimelineEvent,
} from "metabase-types/api";

import {
  getFirstQueryResult,
  getQuestion,
  getTransformedSeries,
  getVisibleTimelineEvents,
  getVisualizationSettings,
} from "../selectors";

const colTypeToMetabotColTypeMap: Record<string, MetabotColumnType> = {
  "type/*": "string",
  "type/Array": "string",
  "type/BigInteger": "number",
  "type/Boolean": "boolean",
  "type/Date": "date",
  "type/DateTime": "datetime",
  "type/DateTimeWithTZ": "datetime",
  "type/DateTimeWithZoneID": "datetime",
  "type/Decimal": "number",
  "type/Dictionary": "string",
  "type/Float": "number",
  "type/Instant": "datetime",
  "type/Integer": "number",
  "type/Number": "number",
  "type/Text": "string",
  "type/Time": "time",
  "type/TimeWithTZ": "time",
  "type/UUID": "string",
};

const getMetabotColType = (
  colBaseType: string | undefined,
): MetabotColumnType => {
  return colBaseType
    ? (colTypeToMetabotColTypeMap[colBaseType] ?? "string")
    : "string";
};

const getDimensions = (
  visualizationSettings: ComputedVisualizationSettings,
) => {
  if (visualizationSettings["graph.dimensions"]) {
    return visualizationSettings["graph.dimensions"];
  }

  if (visualizationSettings["pie.dimension"]) {
    const pieDimension = visualizationSettings["pie.dimension"];
    // pie.dimension can be a string or array (for multi-ring pie charts)
    return Array.isArray(pieDimension) ? pieDimension : [pieDimension];
  }

  if (visualizationSettings["funnel.dimension"]) {
    return [visualizationSettings["funnel.dimension"]];
  }

  return [];
};

const getMetrics = (visualizationSettings: ComputedVisualizationSettings) => {
  if (visualizationSettings["graph.metrics"]) {
    return visualizationSettings["graph.metrics"];
  }

  if (visualizationSettings["pie.metric"]) {
    return [visualizationSettings["pie.metric"]];
  }

  if (visualizationSettings["funnel.metric"]) {
    return [visualizationSettings["funnel.metric"]];
  }

  return [];
};

const TIME_DIMENSION_TYPES = new Set([
  "type/Date",
  "type/DateTime",
  "type/DateTimeWithTZ",
  "type/DateTimeWithZoneID",
  "type/Instant",
]);

const getScalarField = (
  visualizationSettings: ComputedVisualizationSettings,
): string | undefined => {
  return visualizationSettings["scalar.field"] as string | undefined;
};

function processScalarSeries(
  series: RawSeries[number],
  seriesKey: string,
  visualizationSettings: ComputedVisualizationSettings,
): MetabotSeriesConfig | null {
  const { cols, rows } = series.data;
  const scalarField = getScalarField(visualizationSettings);

  // Find the scalar field column, or fall back to first column
  const scalarColIndex = scalarField
    ? cols.findIndex((col) => col.name === scalarField)
    : 0;

  if (scalarColIndex < 0 || !cols[scalarColIndex]) {
    return null;
  }

  const scalarCol = cols[scalarColIndex];
  const values = rows.map((row) => row[scalarColIndex]);

  return {
    x: {
      name: scalarCol.name,
      type: getMetabotColType(scalarCol.base_type),
    },
    x_values: values,
    display_name: seriesKey,
    chart_type: series.card.display as CardDisplayType,
  };
}

function processSmartScalarSeries(
  series: RawSeries[number],
  seriesKey: string,
  visualizationSettings: ComputedVisualizationSettings,
): MetabotSeriesConfig | null {
  const { cols, rows } = series.data;
  const scalarField = getScalarField(visualizationSettings);

  const scalarColIndex = scalarField
    ? cols.findIndex((col) => col.name === scalarField)
    : 0;

  if (scalarColIndex < 0 || !cols[scalarColIndex]) {
    return null;
  }

  const timeDimensionIndex = cols.findIndex(
    (col, index) =>
      index !== scalarColIndex &&
      col.base_type &&
      TIME_DIMENSION_TYPES.has(col.base_type),
  );

  const scalarCol = cols[scalarColIndex];

  const latestRowIndex = rows.findLastIndex(
    (row) => row[scalarColIndex] != null && row[scalarColIndex] !== "",
  );

  if (latestRowIndex < 0) {
    return null;
  }

  const currentValue = rows[latestRowIndex][scalarColIndex];
  const currentDate =
    timeDimensionIndex >= 0 ? rows[latestRowIndex][timeDimensionIndex] : null;

  const comparisons = visualizationSettings["scalar.comparisons"] as
    | Array<{ type: string; value?: number; column?: string; label?: string }>
    | undefined;
  const firstComparison = comparisons?.[0];

  let comparisonValue: unknown = null;
  let comparisonDate: unknown = null;

  if (firstComparison) {
    const result = match(firstComparison.type)
      .with(COMPARISON_TYPES.STATIC_NUMBER, () => ({
        value: findStaticNumberValue(firstComparison as any),
        date: null,
      }))
      .with(COMPARISON_TYPES.ANOTHER_COLUMN, () => ({
        value: findAnotherColumnValue({
          comparison: firstComparison as any,
          cols,
          rows,
          latestRowIndex,
        }),
        date: null,
      }))
      .otherwise(
        () =>
          findPreviousValue({
            rows,
            dimensionColIndex: timeDimensionIndex,
            metricColIndex: scalarColIndex,
            latestRowIndex,
          }) ?? { value: null, date: null },
      );

    comparisonValue = result.value;
    comparisonDate = result.date;
  } else {
    // Default to previous value when no comparison is specified
    const result = findPreviousValue({
      rows,
      dimensionColIndex: timeDimensionIndex,
      metricColIndex: scalarColIndex,
      latestRowIndex,
    });

    if (result) {
      comparisonValue = result.value;
      comparisonDate = result.date;
    }
  }

  // Build the series config with just the two relevant data points
  if (timeDimensionIndex >= 0) {
    const timeDimensionCol = cols[timeDimensionIndex];
    const xValues =
      comparisonDate != null ? [comparisonDate, currentDate] : [currentDate];
    const yValues =
      comparisonValue != null
        ? [comparisonValue, currentValue]
        : [currentValue];

    return {
      x: {
        name: timeDimensionCol.name,
        type: getMetabotColType(timeDimensionCol.base_type),
      },
      y: {
        name: scalarCol.name,
        type: getMetabotColType(scalarCol.base_type),
      },
      x_values: xValues,
      y_values: yValues,
      display_name: seriesKey,
      chart_type: series.card.display as CardDisplayType,
    };
  }

  // No time dimension - just send the values
  const xValues =
    comparisonValue != null ? [comparisonValue, currentValue] : [currentValue];

  return {
    x: {
      name: scalarCol.name,
      type: getMetabotColType(scalarCol.base_type),
    },
    x_values: xValues,
    display_name: seriesKey,
    chart_type: series.card.display as CardDisplayType,
  };
}

export function processSeriesData(
  transformedSeriesData: RawSeries,
  visualizationSettings: ComputedVisualizationSettings | undefined,
) {
  if (!visualizationSettings) {
    return {};
  }

  return transformedSeriesData
    .filter((series) => !!series.data.cols && !!series.data.rows)
    .reduce(
      (acc, series, index) => {
        const { cols, rows } = series.data;
        const seriesKey = series.card.name || `series_${index}`;

        // Handle scalar charts
        if (series.card.display === "scalar") {
          const scalarConfig = processScalarSeries(
            series,
            seriesKey,
            visualizationSettings,
          );
          if (scalarConfig) {
            return Object.assign(acc, { [seriesKey]: scalarConfig });
          }
          return acc;
        }

        // Handle smartscalar charts (includes time dimension for trend context)
        if (series.card.display === "smartscalar") {
          const smartScalarConfig = processSmartScalarSeries(
            series,
            seriesKey,
            visualizationSettings,
          );
          if (smartScalarConfig) {
            return Object.assign(acc, { [seriesKey]: smartScalarConfig });
          }
          return acc;
        }

        // Handle dimension/metric charts (line, bar, pie, funnel, etc.)
        const dimensions = getDimensions(visualizationSettings);
        const metrics = getMetrics(visualizationSettings);

        const dimensionIndex = cols.findIndex((col) =>
          dimensions.includes(col.name),
        );
        const metricIndex = cols.findIndex((col) => metrics.includes(col.name));

        if (dimensionIndex < 0 || metricIndex < 0) {
          return acc;
        }

        const dimensionCol = cols[dimensionIndex];
        const metricCol = cols[metricIndex];

        return Object.assign(acc, {
          [seriesKey]: {
            x: {
              name: dimensionCol.name,
              type: getMetabotColType(dimensionCol.base_type),
            },
            y: {
              name: metricCol.name,
              type: getMetabotColType(metricCol.base_type),
            },
            x_values: rows.map((row) => row[dimensionIndex]),
            y_values: rows.map((row) => row[metricIndex]),
            display_name: seriesKey,
            chart_type: series.card.display,
            stacked:
              visualizationSettings["stackable.stack_type"] === "stacked",
          },
        });
      },
      {} as Record<string, MetabotSeriesConfig>,
    );
}

function processTimelineEvents(timelineEvents: TimelineEvent[]) {
  return timelineEvents
    .map((event) => ({
      name: event.name,
      description: event.description ?? "",
      timestamp: dayjs.tz(dayjs(event.timestamp)).format(),
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(0, 20);
}

async function getVisualizationDataUri(question: Question) {
  const cardId = question.id();
  const display = question.card().display;

  const format =
    PLUGIN_AI_ENTITY_ANALYSIS.chartAnalysisRenderFormats[display] ??
    ("none" as const);

  try {
    return await match(format)
      .with("none", () => undefined)
      .with("svg", () =>
        getVisualizationSvgDataUri(getChartSelector({ cardId })),
      )
      .with("png", () => getChartImagePngDataUri(getChartSelector({ cardId })))
      .exhaustive();
  } catch (err) {
    // Image generation can fail (e.g., missing html2canvas), but context should still work
    return undefined;
  }
}

const getDisplayType = (
  question: Question,
  visualizationSettings: ComputedVisualizationSettings | undefined,
): MetabotDisplayType => {
  if (visualizationSettings?.["graph.x_axis.scale"] === "histogram") {
    return "histogram";
  }
  return question.display();
};

const getChartConfigs = async ({
  question,
  series,
  visualizationSettings,
  timelineEvents,
}: {
  question: Question;
  series: RawSeries;
  visualizationSettings: ComputedVisualizationSettings | undefined;
  timelineEvents: TimelineEvent[];
}): Promise<MetabotChartConfig[]> => {
  try {
    return [
      {
        image_base_64: await getVisualizationDataUri(question),
        title: question.displayName(),
        description: question.description(),
        series: processSeriesData(series, visualizationSettings),
        timeline_events: processTimelineEvents(timelineEvents),
        query: question.datasetQuery(),
        display_type: getDisplayType(question, visualizationSettings),
      },
    ];
  } catch (err) {
    console.error(err);
    return [];
  }
};

export const registerQueryBuilderMetabotContextFn = async ({
  question,
  series,
  visualizationSettings,
  timelineEvents,
  queryResult,
}: {
  question: Question | undefined;
  series: RawSeries;
  visualizationSettings: ComputedVisualizationSettings | undefined;
  timelineEvents: TimelineEvent[];
  queryResult: any;
}) => {
  if (!PLUGIN_METABOT.isEnabled()) {
    return {};
  }
  if (!question) {
    return {};
  }

  const questionCtx = question.isSaved()
    ? { id: question.id(), type: question.type() }
    : { type: "adhoc" as const };

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);
  const queryCtx = {
    query: question.datasetQuery(),
    sql_engine: isNative ? Lib.engine(query) : undefined,
    error: queryResult?.error,
  };

  const chart_configs = await getChartConfigs({
    question,
    series,
    visualizationSettings,
    timelineEvents,
  });

  return {
    user_is_viewing: [
      {
        ...questionCtx,
        ...queryCtx,
        chart_configs,
      },
    ],
  };
};

export const useRegisterQueryBuilderMetabotContext = () => {
  useRegisterMetabotContextProvider(async (state) => {
    const question = getQuestion(state);
    const series = getTransformedSeries(state);
    const visualizationSettings = getVisualizationSettings(state);
    const timelineEvents = getVisibleTimelineEvents(state);
    const queryResult = getFirstQueryResult(state);

    return registerQueryBuilderMetabotContextFn({
      question,
      series,
      visualizationSettings,
      timelineEvents,
      queryResult,
    });
  }, []);
};
