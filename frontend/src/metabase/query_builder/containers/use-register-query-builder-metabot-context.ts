import dayjs from "dayjs";

import { useRegisterMetabotContextProvider } from "metabase/metabot";
import * as Lib from "metabase-lib";

import {
  getBase64ChartImage,
  getChartSelector,
} from "metabase/visualizations/lib/image-exports";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type {
  MetabotColumnType,
  MetabotSeriesConfig,
} from "metabase-types/api";

import {
  getFirstQueryResult,
  getIsLoadingComplete,
  getQuestion,
  getTransformedSeries,
  getTransformedTimelines,
  getVisualizationSettings,
} from "../selectors";
import { get } from "underscore";

const colTypeToMetabotColTypeMap: Record<string, MetabotColumnType> = {
  "type/Boolean": "boolean" as const,
  "type/Float": "number" as const,
  "type/Integer": "number" as const,
  "type/Decimal": "number" as const,
  "type/BigInteger": "number" as const,
  "type/Number": "number" as const,
  "type/Date": "date" as const,
  "type/DateTime": "datetime" as const,
  "type/DateTimeWithTZ": "datetime" as const,
  "type/DateTimeWithZoneID": "datetime" as const,
  "type/Instant": "datetime" as const,
  "type/Time": "time" as const,
  "type/TimeWithTZ": "time" as const,
  "type/Text": "string" as const,
  "type/UUID": "string" as const,
  "type/Dictionary": "string" as const,
  "type/Array": "string" as const,
  "type/*": "string" as const,
};

const getMetabotColType = (
  colBaseType: string | undefined,
): MetabotColumnType => {
  return colBaseType
    ? (colTypeToMetabotColTypeMap[colBaseType] ?? ("string" as const))
    : ("string" as const);
};

export const useRegisterQueryBuilderMetabotContext = () => {
  useRegisterMetabotContextProvider(async (state) => {
    const question = getQuestion(state);
    const isLoadingComplete = getIsLoadingComplete(state);
    if (!question || !isLoadingComplete) {
      return {};
    }

    const { isNative } = Lib.queryDisplayInfo(question.query());
    const queryResult = getFirstQueryResult(state);
    const getQuestionType = (question) => {
      if (question.isSaved()) {
        return question.type();
      }
      return isNative ? ("native" as const) : ("adhoc" as const);
    };

    let image_base_64 = undefined;
    try {
      image_base_64 = await getBase64ChartImage(
        getChartSelector({ cardId: question.id() }),
      );
    } catch (error) {
      console.warn("Failed to capture chart image:", error);
    }

    const vizSettings: ComputedVisualizationSettings =
      getVisualizationSettings(state);
    const timelines = getTransformedTimelines(state);
    const transformedSeriesData = getTransformedSeries(state);

    const questionCtx = {
      id: question.isSaved() ? question.id() : undefined,
      type: getQuestionType(question)
    };

    const series = !vizSettings
      ? {}
      : transformedSeriesData
          .filter((series) => !!series.data.cols && !!series.data.rows)
          .reduce(
            (acc, series, index) => {
              const { cols, rows } = series.data;
              const seriesKey = series.card.name || `series_${index}`;

              const dimensionCol = cols.find(
                (col) => !!vizSettings["graph.dimensions"]?.includes(col.name),
              );
              const metricCol = cols.find(
                (col) => !!vizSettings["graph.metrics"]?.includes(col.name),
              );
              if (!dimensionCol || !metricCol) {
                return acc;
              }

              const dimensionIndex = cols.findIndex(
                (col) => col.name === dimensionCol.name,
              );
              const metricIndex = cols.findIndex(
                (col) => col.name === metricCol.name,
              );
              if (dimensionIndex < 0 || metricIndex < 0) {
                return acc;
              }

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
                  stacked: vizSettings["stackable.stack_type"] === "stacked",
                },
              });
            },
            {} as Record<string, MetabotSeriesConfig>,
          );

    const timeline_events = timelines
      .flatMap((timeline) => timeline.events ?? [])
      .map((event) => ({
        name: event.name,
        description: event.description ?? "",
        timestamp: dayjs.tz(dayjs(event.timestamp)).format(),
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .slice(0, 20);

    return {
      user_is_viewing: [
        {
          ...questionCtx,
          query: question.datasetQuery(),
          sql_dialect: null, // TODO
          chart_configs: [
            {
              image_base_64,
              title: question.displayName(),
              description: question.description(),
              series,
              timeline_events,
            },
          ],
          error: queryResult?.error
        },
      ],
    };
  }, []);
};
