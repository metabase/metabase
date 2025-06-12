import dayjs from "dayjs";
import _ from "underscore";

import * as Lib from "metabase-lib";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { getChartSelector } from "metabase/visualizations/lib/image-exports";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type {
  MetabotColumnType,
  MetabotSeriesConfig,
  RawSeries,
  Timeline,
} from "metabase-types/api";

import {
  getFirstQueryResult,
  getIsLoadingComplete,
  getQuestion,
  getTransformedSeries,
  getTransformedTimelines,
  getVisualizationSettings,
} from "../selectors";

// TODO: not sure this is properly exhaustive?
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
        const dimensions = visualizationSettings["graph.dimensions"] ?? [];
        const metrics = visualizationSettings["graph.metrics"] ?? [];

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

function processTimelineEvents(timelines: Timeline[]) {
  return timelines
    .flatMap((timeline) => timeline.events ?? [])
    .map((event) => ({
      name: event.name,
      description: event.description ?? "",
      timestamp: dayjs.tz(dayjs(event.timestamp)).format(),
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(0, 20);
}

export const registerQueryBuilderMetabotContextFn = async ({
  isLoadingComplete,
  question,
  series,
  visualizationSettings,
  timelines,
  queryResult,
}: {
  isLoadingComplete: boolean;
  question: Question | undefined;
  series: RawSeries;
  visualizationSettings: ComputedVisualizationSettings | undefined;
  timelines: Timeline[];
  queryResult: any;
}) => {
  if (!question) {
    return {};
  }

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);
  const questionCtx = question.isSaved()
    ? { id: question.id(), type: question.type() }
    : { type: "adhoc" as const };
  const queryCtx = {
    query: question.datasetQuery(),
    sql_engine: isNative ? Lib.engine(query) : undefined,
    is_native: isNative,
    error: queryResult?.error,
  };

  const svgElement = isLoadingComplete
    ? document.querySelector(
        `${getChartSelector({ cardId: question.id() })} svg`,
      )
    : undefined;
  const svgString = svgElement
    ? new XMLSerializer().serializeToString(svgElement)
    : undefined;
  const image_base_64 = svgString
    ? `data:image/svg;base64,${window.btoa(svgString)}`
    : undefined;

  return {
    user_is_viewing: [
      {
        ...questionCtx,
        ...queryCtx,
        chart_configs: [
          {
            image_base_64,
            title: question.displayName(),
            description: question.description(),
            series: isLoadingComplete
              ? processSeriesData(series, visualizationSettings)
              : undefined,
            timeline_events: isLoadingComplete
              ? processTimelineEvents(timelines)
              : undefined,
          },
        ],
      },
    ],
  };
};

export const useRegisterQueryBuilderMetabotContext = () => {
  useRegisterMetabotContextProvider((state) => {
    const isLoadingComplete = getIsLoadingComplete(state);
    const question = getQuestion(state);
    const series = getTransformedSeries(state);
    const visualizationSettings = getVisualizationSettings(state);
    const timelines = getTransformedTimelines(state);
    const queryResult = getFirstQueryResult(state);

    return registerQueryBuilderMetabotContextFn({
      isLoadingComplete,
      question,
      series,
      visualizationSettings,
      timelines,
      queryResult,
    });
  }, []);
};
