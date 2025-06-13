import dayjs from "dayjs";

import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { PLUGIN_AI_ENTITY_ANALYSIS } from "metabase/plugins";
import { getChartSelector } from "metabase/visualizations/lib/image-exports";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type {
  MetabotChartConfig,
  MetabotColumnType,
  MetabotSeriesConfig,
  RawSeries,
  Timeline,
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
    return [];
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

function getVisualizationSvgDataUrl(
  question: Question,
  visualizationSettings: ComputedVisualizationSettings | undefined,
): string | undefined {
  if (!visualizationSettings || question.display() === "table") {
    return undefined;
  }

  const svgElement = document.querySelector(
    `${getChartSelector({ cardId: question.id() })} svg`,
  );
  const svgString = svgElement
    ? new XMLSerializer().serializeToString(svgElement)
    : undefined;
  const image_base_64 = svgString
    ? `data:image/svg;base64,${window.btoa(svgString)}`
    : undefined;

  return image_base_64;
}

const getChartConfigs = ({
  question,
  series,
  visualizationSettings,
  timelines,
}: {
  question: Question;
  series: RawSeries;
  visualizationSettings: ComputedVisualizationSettings | undefined;
  timelines: Timeline[];
}): MetabotChartConfig[] => {
  if (!PLUGIN_AI_ENTITY_ANALYSIS.canAnalyzeQuestion(question)) {
    return [];
  }

  return [
    {
      image_base_64: getVisualizationSvgDataUrl(
        question,
        visualizationSettings,
      ),
      title: question.displayName(),
      description: question.description(),
      series: processSeriesData(series, visualizationSettings),
      timeline_events: processTimelineEvents(timelines),
    },
  ];
};

export const registerQueryBuilderMetabotContextFn = async ({
  question,
  series,
  visualizationSettings,
  timelines,
}: {
  question: Question | undefined;
  series: RawSeries;
  visualizationSettings: ComputedVisualizationSettings | undefined;
  timelines: Timeline[];
}) => {
  if (!question) {
    return {};
  }

  return {
    user_is_viewing: [
      {
        ...(question.isSaved()
          ? { id: question.id(), type: question.type() }
          : { type: "adhoc" as const }),
        query: question.datasetQuery(),
        display_type: question.display(),
        chart_configs: getChartConfigs({
          question,
          series,
          visualizationSettings,
          timelines,
        }),
      },
    ],
  };
};

export const useRegisterQueryBuilderMetabotContext = () => {
  useRegisterMetabotContextProvider((state) => {
    const isLoadingComplete = getIsLoadingComplete(state);

    const question = isLoadingComplete ? getQuestion(state) : undefined;
    const series = getTransformedSeries(state);
    const visualizationSettings = getVisualizationSettings(state);
    const timelines = getTransformedTimelines(state);

    return registerQueryBuilderMetabotContextFn({
      question,
      series,
      visualizationSettings,
      timelines,
    });
  }, []);
};
