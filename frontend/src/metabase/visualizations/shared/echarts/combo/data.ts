import moment from "moment";
import type { ChartColumns } from "metabase/visualizations/lib/graph/columns";
import { getColumnDescriptors } from "metabase/visualizations/lib/graph/columns";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedChartData,
  RenderingEnvironment,
} from "metabase/visualizations/types";
import { isNotNull } from "metabase/core/utils/types";
import type {
  RawSeries,
  RowValue,
  SingleSeries,
  DatasetData,
  TimelineEvent,
} from "metabase-types/api";
import type {
  SeriesDescriptor,
  SeriesKey,
} from "metabase/visualizations/shared/echarts/combo/types";

export const sumMetric = (left: RowValue, right: RowValue) => {
  if (typeof left === "number" && typeof right === "number") {
    return left + right;
  } else if (typeof left === "number") {
    return left;
  } else if (typeof right === "number") {
    return right;
  }

  return null;
};

export const getCardColumns = (
  data: RemappingHydratedChartData,
  settings: ComputedVisualizationSettings,
): ChartColumns => {
  const [dimension, breakout] = getColumnDescriptors(
    (settings["graph.dimensions"] ?? []).filter(isNotNull),
    data.cols,
  );

  const metrics = getColumnDescriptors(
    (settings["graph.metrics"] ?? []).filter(isNotNull),
    data.cols,
  );

  if (breakout) {
    return {
      dimension,
      breakout,
      metric: metrics[0],
    };
  }

  return {
    dimension,
    metrics,
  };
};

const getSeriesKey = (
  columnName: string,
  breakoutColumnName?: string,
  breakoutValue?: RowValue,
) => {
  let key = `${columnName}`;

  if (breakoutColumnName != null) {
    key += `:${breakoutColumnName}:${breakoutValue}`;
  }

  return key;
};

const getSeriesVizSettingsKey = (
  columnName: string,
  cardName: string,
  isMainDataset: boolean,
  breakoutValue?: RowValue,
) => {
  let key = isMainDataset ? "" : `${cardName}: `;
  if (typeof breakoutValue !== "undefined") {
    key += String(breakoutValue);
  } else {
    key += columnName;
  }

  return key;
};

const getBreakoutDistinctValues = (data: DatasetData, breakoutIndex: number) =>
  Array.from(new Set<RowValue>(data.rows.map(row => row[breakoutIndex])));

const getSeriesDescriptors = (
  { card, data }: SingleSeries,
  columns: ChartColumns,
  datasetIndex: number,
  isMainDataset: boolean,
): CardSeriesDescriptors => {
  const { dimension } = columns;
  const xSeries: SeriesDescriptor = {
    datasetIndex,
    cardId: card.id,
    column: dimension.column,
    columnIndex: dimension.index,
    seriesKey: getSeriesKey(dimension.column.name),
    vizSettingsKey: getSeriesVizSettingsKey(
      dimension.column.name,
      card.name,
      isMainDataset,
    ),
  };

  let yMultiSeries;
  if ("breakout" in columns) {
    const { metric, breakout } = columns;
    const breakoutValues = getBreakoutDistinctValues(data, breakout.index);

    yMultiSeries = breakoutValues.map(breakoutValue => {
      return {
        datasetIndex,
        cardId: card.id,
        column: metric.column,
        columnIndex: metric.index,
        seriesKey: getSeriesKey(
          metric.column.name,
          breakout.column.name,
          breakoutValue,
        ),
        breakoutColumnIndex: breakout.index,
        breakoutColumn: breakout.column,
        breakoutValue,
        vizSettingsKey: getSeriesVizSettingsKey(
          metric.column.name,
          card.name,
          isMainDataset,
          breakoutValue,
        ),
      };
    });
  } else {
    yMultiSeries = columns.metrics.map(metric => ({
      datasetIndex,
      cardId: card.id,
      column: metric.column,
      columnIndex: metric.index,
      seriesKey: getSeriesKey(metric.column.name),
      vizSettingsKey: getSeriesVizSettingsKey(
        metric.column.name,
        card.name,
        isMainDataset,
      ),
    }));
  }

  return {
    xSeries,
    yMultiSeries,
  };
};

export interface CardSeriesDescriptors {
  xSeries: SeriesDescriptor;
  yMultiSeries: SeriesDescriptor[];
}

export interface CardModel {
  rawSeries: SingleSeries;
  cardColumns: ChartColumns;
  cardSeries: CardSeriesDescriptors;
  datasetIndex: number;
  dataset: Record<string, RowValue>[];
}

const buildCardModel = (
  rawSeries: SingleSeries,
  settings: ComputedVisualizationSettings,
  isMainDataset: boolean,
  datasetIndex: number,
): CardModel => {
  const cardColumns = getCardColumns(rawSeries.data, settings);
  const cardSeries = getSeriesDescriptors(
    rawSeries,
    cardColumns,
    datasetIndex,
    isMainDataset,
  );
  const dataset = getSingleEChartsDataset(cardSeries, rawSeries);

  return {
    rawSeries,
    cardColumns,
    cardSeries,
    dataset,
    datasetIndex,
  };
};

export const getSingleEChartsDataset = (
  cardSeries: CardSeriesDescriptors,
  rawSeries: SingleSeries,
) => {
  const groupedDataByXValue = new Map<RowValue, Record<SeriesKey, RowValue>>();
  const { data } = rawSeries;
  const { xSeries, yMultiSeries } = cardSeries;

  for (const row of data.rows) {
    const xValue = row[xSeries.columnIndex];

    if (!groupedDataByXValue.has(xValue)) {
      groupedDataByXValue.set(xValue, {
        [xSeries.seriesKey]: xValue,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const datum = groupedDataByXValue.get(xValue)!;

    for (const ySeries of yMultiSeries) {
      const existingValue = datum[ySeries.seriesKey];
      const rowValue = row[ySeries.columnIndex];

      if ("breakoutValue" in ySeries) {
        const rowBreakoutValue = row[ySeries.breakoutColumnIndex];
        if (rowBreakoutValue !== ySeries.breakoutValue) {
          continue;
        }
      }
      datum[ySeries.seriesKey] = sumMetric(existingValue, rowValue);
    }
  }

  return Array.from(groupedDataByXValue.values());
};

const buildOptionSeries = (
  series: SeriesDescriptor,
  settings: ComputedVisualizationSettings,
  defaultDisplay: string,
  xKey: string,
  { getColor }: RenderingEnvironment,
  timelineEvents?: TimelineEvent[],
) => {
  const seriesSettings: any =
    settings.series_settings?.[series.vizSettingsKey] ?? {};
  const display = seriesSettings.display ?? defaultDisplay;

  const stack =
    settings["stackable.stack_type"] != null &&
    ["bar", "area"].includes(display)
      ? display
      : undefined;

  return {
    datasetIndex: series.datasetIndex,
    stack,
    type: display === "bar" ? "bar" : "line",
    areaStyle: display === "area" ? { opacity: 0.3 } : undefined,
    encode: {
      y: series.seriesKey,
      x: xKey,
    },
    label: {
      show: settings["graph.show_values"],
      position: "top",
      fontFamily: "Lato",
      fontWeight: 900,
      fontSize: 12,
      color: getColor("text-dark"),
      textBorderColor: getColor("white"),
      textBorderWidth: 3,
    },
    labelLayout: {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
    },
    itemStyle: {
      color: settings?.["series_settings.colors"]?.[series.vizSettingsKey],
    },
    markLine: {
      // TODO: only do this for a single series
      data: timelineEvents?.map(t => [
        {
          coord: [moment(t.timestamp).toISOString(), 0],
          symbolSize: 15,
          symbolOffset: [0, -10],
        },
        {
          coord: [moment(t.timestamp).toISOString(), 12000],
          symbol: "none",
        },
      ]),
      lineStyle: {
        type: "solid",
        color: "rgba(105, 110, 123, 0.2)",
        width: 2,
      },
    },
  };
};

export const buildOptionMultipleSeries = (
  cardModels: CardModel[],
  settings: ComputedVisualizationSettings,
  defaultDisplay: string,
  environment: RenderingEnvironment,
  timelineEvents?: TimelineEvent[],
) => {
  return cardModels.flatMap(cardModel =>
    cardModel.cardSeries.yMultiSeries.map(series =>
      buildOptionSeries(
        series,
        settings,
        defaultDisplay,
        cardModels[0].cardSeries.xSeries.seriesKey,
        environment,
        timelineEvents,
      ),
    ),
  );
};

export const transformMultipleCards = (
  multipleSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  environment: RenderingEnvironment,
  timelineEvents?: TimelineEvent[],
) => {
  const defaultDisplay = multipleSeries[0].card.display;
  const cardModels = multipleSeries.map((series, index) => {
    const isMainDataset = index === 0;
    return buildCardModel(series, settings, isMainDataset, index);
  });

  const eChartsSeries = buildOptionMultipleSeries(
    cardModels,
    settings,
    defaultDisplay,
    environment,
    timelineEvents,
  );

  return {
    eChartsSeries,
    cardModels,
  };
};
