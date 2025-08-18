import dayjs from "dayjs";
import { match } from "ts-pattern";

import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { PLUGIN_AI_ENTITY_ANALYSIS, PLUGIN_METABOT } from "metabase/plugins";
import {
  getChartImagePngDataUri,
  getChartSelector,
  getChartSvgSelector,
  getVisualizationSvgDataUri,
} from "metabase/visualizations/lib/image-exports";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  MetabotChartConfig,
  MetabotColumnType,
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
    return [visualizationSettings["pie.dimension"]];
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
        const dimensions = getDimensions(visualizationSettings);
        const metrics = getMetrics(visualizationSettings);

        const seriesKey = series.card.name || `series_${index}`;

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

function getVisualizationDataUri(question: Question) {
  const cardId = question.id();
  const display = question.card().display;

  const format =
    PLUGIN_AI_ENTITY_ANALYSIS.chartAnalysisRenderFormats[display] ??
    ("none" as const);

  return match(format)
    .with("none", () => undefined)
    .with("svg", () =>
      getVisualizationSvgDataUri(getChartSvgSelector({ cardId })),
    )
    .with("png", () => getChartImagePngDataUri(getChartSelector({ cardId })))
    .exhaustive();
}

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
        display_type: question.display(),
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
