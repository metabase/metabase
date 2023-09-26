import { t } from "ttag";
import _ from "underscore";
import type { EChartsOption } from "echarts";
import type {
  ComputedVisualizationSettings,
  RenderingEnvironment,
} from "metabase/visualizations/types";
import type {
  RawSeries,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";
import { getDefaultDimensionAndMetric } from "metabase/visualizations/lib/utils";
import { findWithIndex } from "metabase/core/utils/arrays";
import { getColorsForValues } from "metabase/lib/colors/charts";
import type {
  PieChartColumns,
  PieLegendItem,
} from "metabase/visualizations/shared/echarts/pie/types";
import {
  computeLegendDecimals,
  formatPercent,
} from "metabase/visualizations/visualizations/PieChart/utils";

export const DEFAULT_SLICE_THRESHOLD = 0.025; // approx 1 degree in percentage
export const OTHER_SLICE_MIN_PERCENTAGE = 0.003;

export function getSlices(
  rows: RowValues[],
  pieColumns: PieChartColumns,
  settings: VisualizationSettings,
  sliceThreshold: number,
  { getColor, formatValue }: RenderingEnvironment,
) {
  const { dimension, metric } = pieColumns;

  const total = rows.reduce((sum, row) => sum + row[metric.index], 0);
  const colors = getSlicesColors(pieColumns, settings, rows);

  const [slices, others] = _.chain(rows)
    .map((row, index) => ({
      // TODO remove the unused properties here
      key: row[dimension.index],
      // Value is used to determine arc size and is modified for very small
      // other slices. We save displayValue for use in tooltips.
      value: row[metric.index],
      displayValue: row[metric.index],
      percentage: row[metric.index] / total,
      rowIndex: index,
      color: colors[row[dimension.index]],
    }))
    .partition(d => d.percentage > sliceThreshold)
    .value();

  const otherTotal = others.reduce((acc, o) => acc + o.value, 0);
  // Multiple others get squashed together under the key "Other"
  const otherSlice =
    others.length === 1
      ? others[0]
      : {
          key: t`Other`,
          value: otherTotal,
          percentage: otherTotal / total,
          color: getColor("text-light"),
        };
  if (otherSlice.value > 0) {
    // increase "other" slice so it's barely visible
    if (otherSlice.percentage < OTHER_SLICE_MIN_PERCENTAGE) {
      otherSlice.value = total * OTHER_SLICE_MIN_PERCENTAGE;
    }
    slices.push(otherSlice);
  }

  return slices;
}

export const getTotalValueGraphic = (
  rows: RowValues[],
  pieColumns: PieChartColumns,
  settings: ComputedVisualizationSettings,
  { formatValue }: RenderingEnvironment,
) => {
  if (settings["pie.show_total"]) {
    return null;
  }

  const { metric } = pieColumns;

  const total = rows.reduce((sum, row) => sum + row[metric.index], 0);
  const formattedTotal = formatValue(total, {
    ...settings.column?.(metric.column),
    majorWidth: 0,
  });

  return {
    type: "group",
    top: "center",
    left: "center",
    children: [
      {
        type: "text",
        cursor: "text",
        // TODO styles
        style: {
          fill: "#000",
          font: "bold 26px sans-serif",
          textAlign: "center",
          text: formattedTotal,
        },
      },
      {
        type: "text",
        cursor: "text",
        top: 25,
        // TODO styles
        style: {
          fill: "#000",
          font: "bold 26px sans-serif",
          textAlign: "center",
          text: "Total",
        },
      },
    ],
  };
};

const getPieChartColumns = (series: RawSeries): PieChartColumns => {
  const [{ card, data }] = series;
  const settings = card.visualization_settings;

  let dimensionName = settings["pie.dimension"];
  let metricName = settings["pie.metric"];

  if (!dimensionName || !metricName) {
    const defaultColumns = getDefaultDimensionAndMetric(series);

    dimensionName ??= defaultColumns.dimension;
    metricName ??= defaultColumns.metric;
  }

  const dimension = findWithIndex(data.cols, col => col.name === dimensionName);
  const metric = findWithIndex(data.cols, col => col.name === metricName);

  if (!dimension || !metric) {
    // should we throw actually?
    throw new Error("No columns selected");
  }

  return {
    metric: {
      index: metric.index,
      column: metric.item,
    },
    dimension: {
      index: dimension.index,
      column: dimension.item,
    },
  };
};

export const getSlicesColors = (
  pieColumns: PieChartColumns,
  settings: VisualizationSettings,
  rows: RowValues[],
) => {
  const dimensionValues = rows.map(row =>
    String(row[pieColumns.dimension.index]),
  );

  return getColorsForValues(dimensionValues, settings["pie.colors"] ?? {});
};

export const buildPieChart = (
  series: RawSeries,
  environment: RenderingEnvironment,
): { option: EChartsOption; legend: PieLegendItem[] } => {
  if (series.length === 0) {
    return { option: {}, legend: [] };
  }

  const [{ card, data }] = series;
  const { rows } = data;
  const settings = card.visualization_settings;

  const pieColumns = getPieChartColumns(series);

  const sliceThreshold =
    typeof settings["pie.slice_threshold"] === "number"
      ? settings["pie.slice_threshold"] / 100
      : DEFAULT_SLICE_THRESHOLD;

  const slices = getSlices(
    rows,
    pieColumns,
    settings,
    sliceThreshold,
    environment,
  );

  const option = {
    graphic: getTotalValueGraphic(rows, pieColumns, settings, environment),
    series: {
      type: "sunburst",
      radius: ["60%", "90%"],
      sort: undefined,
      data: slices.map(s => ({
        value: s.value,
        name: s.key,
        itemStyle: {
          color: s.color,
        },
      })),
    },
  };

  const legend = slices.map(slice => ({
    title: [String(slice.key)],
    color: slice.color,
  }));
  // const percentages = slices.map(s => s.percentage);
  // const legendDecimals = computeLegendDecimals({ percentages });
  //
  // const legendTitles = slices.map(s => [
  //   s.key === "Other" ? s.key : formatDimension({ value: s.key, props }),
  //   settings["pie.percent_visibility"] === "legend"
  //     ? formatPercent({
  //         percent: s.percentage,
  //         decimals: legendDecimals ?? 0,
  //         settings: settings,
  //         cols: data.cols,
  //       })
  //     : undefined,
  // ]);
  // const legendColors = slices.map(s => s.color);

  return {
    option,
    legend,
  };
};
