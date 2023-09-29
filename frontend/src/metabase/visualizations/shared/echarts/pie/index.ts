import { t } from "ttag";
import _ from "underscore";
import type { EChartsOption } from "echarts";
import type {
  ColorGetter,
  ComputedVisualizationSettings,
  EChartsEventHandler,
  HoveredObject,
  RenderingEnvironment,
} from "metabase/visualizations/types";
import type { RawSeries, RowValues } from "metabase-types/api";
import { findWithIndex } from "metabase/core/utils/arrays";
import type {
  PieChartColumns,
  PieChartModel,
  PieLegendItem,
  PieSlice,
} from "metabase/visualizations/shared/echarts/pie/types";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { isNotNull } from "metabase/core/utils/types";
import { OTHER_SLICE_MIN_PERCENTAGE } from "metabase/visualizations/echarts/visualizations/PieChart/constants";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import {
  computeLegendDecimals,
  computeLabelDecimals,
  getTooltipModel,
} from "./utils";

type Formatter = (value: unknown) => string;
type PercentFormatter = (value: unknown, decimals: number) => string;

interface Formatters {
  formatDimension: Formatter;
  formatMetric: Formatter;
  formatPercent: PercentFormatter;
}

const getFormatters = (
  pieColumns: PieChartColumns,
  settings: ComputedVisualizationSettings,
  { formatValue }: RenderingEnvironment,
): Formatters => {
  const formatDimension = (value: unknown, jsx = true) =>
    formatValue(value, {
      ...settings.column(pieColumns.dimension.column),
      jsx,
      majorWidth: 0,
    });
  const formatMetric = (value: unknown, jsx = true) =>
    formatValue(value, {
      ...settings.column(pieColumns.metric.column),
      jsx,
      majorWidth: 0,
    });

  const formatPercent = (percent: unknown, decimals: number) =>
    formatValue(percent, {
      column: pieColumns.metric.column,
      number_separators: settings.column(pieColumns.metric.column)
        ?.number_separators,
      jsx: true,
      majorWidth: 0,
      number_style: "percent",
      decimals,
    });

  return {
    formatDimension,
    formatMetric,
    formatPercent,
  };
};

const getSlices = (
  rows: RowValues[],
  pieColumns: PieChartColumns,
  settings: ComputedVisualizationSettings,
  sliceThreshold: number,
  { getColor }: RenderingEnvironment,
): PieChartModel => {
  const { dimension, metric } = pieColumns;

  const total = rows.reduce((sum, row) => sum + row[metric.index], 0);

  const [slices, others] = _.chain(rows)
    .map((row, index): PieSlice => {
      const metricValue = row[metric.index] ?? 0;
      const dimensionValue = row[dimension.index] ?? NULL_DISPLAY_VALUE;

      if (typeof metricValue != "number") {
        throw new Error("pie chart metric column should be numeric");
      }

      return {
        key: dimensionValue,
        value: metricValue,
        percentage: metricValue / total,
        rowIndex: index,
        color: settings["pie.colors"]?.[dimensionValue],
      };
    })
    .partition(d => d.percentage > sliceThreshold)
    .value();

  const otherTotal = others.reduce((acc, o) => acc + o.value, 0);
  // Multiple others get squashed together under the key "Other"
  const otherSlice: PieSlice =
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

  return {
    slices,
    total,
  };
};

export const getTotalValueGraphic = (
  total: number,
  formatMetric: Formatter,
  getColor: ColorGetter,
) => {
  const formattedTotal = formatMetric(Math.round(total));

  return {
    type: "group",
    top: "center",
    left: "center",
    children: [
      {
        type: "text",
        cursor: "text",
        style: {
          fill: getColor("text-dark"),
          fontSize: "22px",
          fontFamily: "Lato, sans-serif",
          fontWeight: "700",
          textAlign: "center",
          text: formattedTotal,
        },
      },
      {
        type: "text",
        cursor: "text",
        top: 25,
        style: {
          fill: getColor("text-light"),
          fontSize: "14px",
          fontFamily: "Lato, sans-serif",
          fontWeight: "700",
          textAlign: "center",
          // no text-transform support
          text: t`Total`.toUpperCase(),
        },
      },
    ],
  };
};

const getPieChartColumns = (
  series: RawSeries,
  settings: ComputedVisualizationSettings,
): PieChartColumns => {
  const [{ data }] = series;

  const dimension = findWithIndex(
    data.cols,
    col => col.name === settings["pie.dimension"],
  );
  const metric = findWithIndex(
    data.cols,
    col => col.name === settings["pie.metric"],
  );

  if (!dimension || !metric) {
    throw new Error(t`No columns selected`);
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

export const buildPieChart = (
  series: RawSeries,
  settings: ComputedVisualizationSettings,
  environment: RenderingEnvironment,
  onHoverChange?: any,
  hovered?: HoveredObject,
  onVisualizationClick?: any,
): {
  option: EChartsOption;
  legend: PieLegendItem[];
  eventHandlers: EChartsEventHandler[];
} => {
  if (series.length === 0) {
    return { option: {}, legend: [], eventHandlers: [] };
  }

  const [{ data }] = series;
  const { rows, cols } = data;

  const pieColumns = getPieChartColumns(series, settings);

  const { formatDimension, formatMetric, formatPercent } = getFormatters(
    pieColumns,
    settings,
    environment,
  );

  const sliceThreshold = settings["pie.slice_threshold"]! / 100;

  const { slices, total } = getSlices(
    rows,
    pieColumns,
    settings,
    sliceThreshold,
    environment,
  );

  const percentages = slices.map(s => s.percentage);
  const legendDecimals = computeLegendDecimals({ percentages });
  const labelsDecimals = computeLabelDecimals({ percentages }) ?? 0;

  const option = {
    // should be shared between charts
    // also we need to inject the fontFamily from the top
    textStyle: {
      fontFamily: "Lato, sans-serif",
    },
    graphic: settings["pie.show_total"]
      ? getTotalValueGraphic(total, formatMetric, environment.getColor)
      : null,
    series: {
      nodeClick: false,
      type: "sunburst",
      radius: ["60%", "90%"],
      emphasis: { focus: "none" },
      sort: undefined,
      label: {
        rotate: 0,
        overflow: "none",
        lineHeight: 50,
        fontSize: 16,
        formatter: ({ value }) => {
          const percent = value / total;
          if (percent > 0.1) {
            return formatPercent(value / total, labelsDecimals);
          }
          // returning an " " when we want to hide a label :(
          // requires computing arcs by ourselves to detect if a label can fit inside one
          return " ";
        },
        // should check contrast manually — that's ok
        color: "white",
      },
      data: slices.map((s, index) => {
        let opacity = 1;

        if (hovered != null && index !== hovered?.index) {
          opacity = 0.2;
        }

        return {
          value: s.value,
          name: s.key,
          itemStyle: {
            color: s.color,
            opacity,
          },
        };
      }),
    },
  };

  const legend = slices.map(slice => ({
    color: slice.color,
    title: [
      slice.key === t`Other` ? slice.key : formatDimension(slice.key),
      settings["pie.percent_visibility"] === "legend"
        ? formatPercent(slice.percentage, legendDecimals ?? 0)
        : undefined,
    ].filter(isNotNull),
  }));

  const eventHandlers: EChartsEventHandler[] = [
    {
      eventName: "mouseout",
      handler: () => {
        onHoverChange?.(null);
      },
    },
    {
      eventName: "mousemove",
      handler: event => {
        const { index } = findWithIndex(
          slices,
          slice => slice.key === event.data?.name,
        );

        const simplifiedTooltipModelForTest = getTooltipModel(
          slices,
          index,
          getFriendlyName(pieColumns.dimension.column),
          formatDimension,
          formatMetric,
        );

        onHoverChange?.({
          settings,
          index,
          event: event.event.event,
          stackedTooltipModel: simplifiedTooltipModelForTest,
        });
      },
    },
    {
      eventName: "click",
      handler: event => {
        const slice = slices.find(slice => slice.key === event.data?.name);

        if (!slice) {
          return;
        }

        const sliceRows = slice.rowIndex != null && rows[slice.rowIndex];
        const data =
          sliceRows &&
          sliceRows.map((value, index) => ({
            value,
            col: cols[index],
          }));

        onVisualizationClick?.({
          event: event.event.event,
          value: slice.value,
          column: pieColumns.metric.column,
          data,
          dimensions: [
            {
              value: slice.key,
              column: pieColumns.dimension.column,
            },
          ],
          settings,
        });
      },
    },
  ];

  return {
    option,
    legend,
    eventHandlers,
  };
};
