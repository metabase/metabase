import dayjs from "dayjs";

import { useRegisterMetabotContextProvider } from "metabase/metabot";
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
  getIsLoadingComplete,
  getQuestion,
  getTransformedSeries,
  getTransformedTimelines,
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

export const useRegisterQueryBuilderMetabotContext = () => {
  useRegisterMetabotContextProvider(async (state) => {
    const question = getQuestion(state);
    const isLoadingComplete = getIsLoadingComplete(state);
    if (!question || !isLoadingComplete) {
      return {};
    }

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

    const questionCtx = question.isSaved()
      ? { id: question.id(), type: question.type() }
      : { type: "adhoc" as const };

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
          chart_configs: [
            {
              image_base_64,
              title: question.displayName(),
              description: question.description(),
              series,
              timeline_events,
            },
          ],
        },
      ],
    };
  }, []);
};
