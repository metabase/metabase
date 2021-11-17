import _ from "underscore";

import {
  Accessor,
  AxisType,
  Column,
  ColumnId,
  ColumnValue,
  Data,
  Datum,
  QuestionDataset,
  QuestionType,
  VisualizationSettings,
} from "../types";

const getGroupedColumnId = (value: ColumnValue) => `grouped_by_${value}`;

const getSeriesVisualizationType = (
  seriesName: string,
  questionType: QuestionType,
  seriesSettings: VisualizationSettings["seriesSettings"] | undefined,
) => {
  const settings = seriesSettings?.[seriesName];

  if (settings) {
    return settings.type;
  }

  return questionType === "combo" ? "line" : questionType;
};


export const groupBySecondDimension = (
  data: Data,
  columns: Column[],
  settings: VisualizationSettings,
) => {
  const { dimensions, metrics } = settings;
  const [xIndex, xGroupByIndex] = dimensions.map(dimension =>
    columns.findIndex(column => column.id === dimension),
  );

  const [metricIndex] = metrics.map(metric =>
    columns.findIndex(column => column.id === metric),
  );

  const groupByValues = _.uniq(data.map(datum => datum[xGroupByIndex]));

  const rows = new Map<ColumnValue, Datum>();

  for (let i = 0; i < data.length; i++) {
    const datum = data[i];
    const xValue = datum[xIndex];
    const valueToGroupBy = datum[xGroupByIndex];
    const metricValue = datum[metricIndex];

    const rowKey = xValue == null ? xValue : xValue.valueOf();

    const row = rows.get(rowKey) || [xValue];
    const columnIndex = groupByValues.findIndex(
      value => value === valueToGroupBy,
    );

    row[columnIndex] = metricValue;
    rows.set(rowKey, row);
  }

  const groupedData = Array.from(rows.values());
  const groupedColumns = [
    columns[xIndex],
    ...groupByValues.map(value => ({
      // TODO: get correct name for dates, numeric ranges, etc
      name: `${value}`,
      id: getGroupedColumnId(value),
    })),
  ];
  const groupedDimensions = [columns[xIndex].id];
  const groupedMetrics = groupByValues.map(value => getGroupedColumnId(value));

  return {
    dataset: groupedData,
    columns: groupedColumns,
    dimensions: groupedDimensions,
    metrics: groupedMetrics,
  };
};

export const getSeries = (
  columns: Column[],
  dimensions: ColumnId[],
  metrics: ColumnId[],
  dataset: Data,
  questionType: QuestionType,
  seriesSettings: VisualizationSettings["seriesSettings"]
) => {
  const metricsIndices = metrics.map(metric =>
    columns.findIndex(column => column.id === metric),
  );

  const dimensionsIndices = dimensions.map(dimension =>
    columns.findIndex(column => column.id === dimension),
  );

  const [dimensionIndex] = dimensionsIndices;

  const xAccessor = (datum: Datum) => datum[dimensionIndex];

  const series = metricsIndices.map(metricIndex => {
    const column = columns[metricIndex];
    const name = column.name;

    const yAccessor = (datum: Datum) => datum[metricIndex];

    const type = getSeriesVisualizationType(name, questionType, seriesSettings)

    return {
      name,
      type,
      yAccessor,
    };
  });

  return {
    dataset,
    xAccessor,
    series
  }
};

const inferAxisType = (values: ColumnValue[]): AxisType => {
  const firstNonNullValue = values.find(value => value != null) as string | number

  if (typeof firstNonNullValue === 'number') {
    return 'linear'
  }

  // TODO: improve date check
  const isDate = !isNaN(new Date(firstNonNullValue).getDate());
  if (isDate) {
    return 'timeseries'
  }

  return "ordinal"
}


const getXAxisType = (settings: VisualizationSettings, data: Data, xAccessor: Accessor): AxisType => {
  return settings.axes.x.type || inferAxisType(data.map(datum => xAccessor(datum)))
}

export const transformQuestionDataset = (data: QuestionDataset) => {
  const { type, dataset, columns, settings } = data;

  const dimensionsIndices = settings.dimensions.map(dimension =>
    columns.findIndex(column => column.id === dimension),
  );

  const shouldGroupData = dimensionsIndices.length > 1;

  if (!shouldGroupData) {
    return getSeries(columns, settings.dimensions, settings.metrics, dataset, type, settings.seriesSettings);
  }

  const grouped = groupBySecondDimension(dataset, columns, settings);

  getSeries(
    grouped.columns,
    grouped.dimensions,
    grouped.metrics,
    grouped.dataset,
    type,
    settings.seriesSettings
  );
};
