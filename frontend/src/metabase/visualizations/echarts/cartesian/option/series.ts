import _ from "underscore";
import type { RegisteredSeriesOption } from "echarts";
import type { SeriesLabelOption } from "echarts/types/src/util/types";

import type { CallbackDataParams } from "echarts/types/dist/shared";
import type { LabelLayoutOptionCallbackParams } from "echarts/types/dist/echarts";
import type {
  SeriesModel,
  CartesianChartModel,
  DataKey,
  StackTotalDataKey,
  ChartDataset,
  Datum,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RowValue, SeriesSettings } from "metabase-types/api";
import { isNotNull } from "metabase/lib/types";
import { getMetricDisplayValueGetter } from "metabase/visualizations/echarts/cartesian/model/dataset";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";

import { getObjectValues } from "metabase/lib/objects";
import type { EChartsSeriesOption } from "metabase/visualizations/echarts/cartesian/option/types";
import { buildEChartsScatterSeries } from "../scatter/series";
import { buildEChartsWaterfallSeries } from "../waterfall/series";
import { checkWaterfallChartModel } from "../waterfall/utils";
import { getSeriesYAxisIndex } from "./utils";

export function getDataLabelFormatter(
  seriesModel: SeriesModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) {
  const valueFormatter = (value: unknown) =>
    renderingContext.formatValue(value, {
      ...(settings.column?.(seriesModel.column) ?? {}),
      jsx: false,
      compact: settings["graph.label_value_formatting"] === "compact",
    });

  const valueGetter = getMetricDisplayValueGetter(settings);

  return (datum: CallbackDataParams) => {
    const dimensionIndex = datum?.encode?.y[0];
    const dimensionName =
      dimensionIndex != null ? datum?.dimensionNames?.[dimensionIndex] : null;
    if (dimensionName == null) {
      return " ";
    }
    const value = valueGetter((datum?.value as any)?.[dimensionName]);
    return valueFormatter(value);
  };
}

export const buildEChartsLabelOptions = (
  seriesModel: SeriesModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
  show?: boolean,
  position?: "top" | "bottom" | "inside",
): SeriesLabelOption => {
  return {
    silent: true,
    show,
    position,
    fontFamily: renderingContext.fontFamily,
    fontWeight: CHART_STYLE.seriesLabels.weight,
    fontSize: CHART_STYLE.seriesLabels.size,
    color: renderingContext.getColor("text-dark"),
    textBorderColor: renderingContext.getColor("white"),
    textBorderWidth: 3,
    formatter: getDataLabelFormatter(seriesModel, settings, renderingContext),
  };
};

const buildEChartsBarSeries = (
  dataset: ChartDataset,
  seriesModel: SeriesModel,
  settings: ComputedVisualizationSettings,
  dimensionDataKey: string,
  yAxisIndex: number,
  barSeriesCount: number,
  hasMultipleSeries: boolean,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["bar"] => {
  const stackName =
    settings["stackable.stack_type"] != null ? `bar_${yAxisIndex}` : undefined;

  const isHistogram = settings["graph.x_axis.scale"] === "histogram";
  const barWidth = isHistogram ? `${100 / barSeriesCount - 1}%` : undefined;

  return {
    id: seriesModel.dataKey,
    emphasis: {
      focus: hasMultipleSeries ? "series" : "self",
      itemStyle: {
        color: seriesModel.color,
      },
    },
    blur: {
      label: {
        show: settings["graph.show_values"] && !hasMultipleSeries,
      },
      itemStyle: {
        opacity: 0.3,
      },
    },
    type: "bar",
    zlevel: CHART_STYLE.series.zIndex,
    yAxisIndex,
    barGap: 0,
    stack: stackName,
    barWidth,
    encode: {
      y: seriesModel.dataKey,
      x: dimensionDataKey,
    },
    label: buildEChartsLabelOptions(
      seriesModel,
      settings,
      renderingContext,
      settings["graph.show_values"] && settings["stackable.stack_type"] == null,
    ),
    labelLayout: params => {
      const { dataIndex, rect } = params;
      if (dataIndex == null) {
        return {};
      }

      const labelValue = dataset[dataIndex][seriesModel.dataKey];
      if (typeof labelValue !== "number") {
        return {};
      }

      const barHeight = rect.height;
      const labelOffset =
        barHeight / 2 +
        CHART_STYLE.seriesLabels.size / 2 +
        CHART_STYLE.seriesLabels.offset;
      return {
        hideOverlap: settings["graph.label_value_frequency"] === "fit",
        dy: labelValue < 0 ? labelOffset : -labelOffset,
      };
    },
    itemStyle: {
      color: seriesModel.color,
    },
  };
};

function getShowSymbol(
  seriesModel: SeriesModel,
  seriesSettings: SeriesSettings,
  dataset: ChartDataset,
  chartWidth: number,
) {
  // "line.marker_enabled" correponds to the "Show dots on lines" series setting
  // and can be true, false, or undefined
  // true = on
  // false = off
  // undefined = auto
  const isNotAuto = seriesSettings["line.marker_enabled"] != null;
  if (isNotAuto) {
    return seriesSettings["line.marker_enabled"];
  }
  if (chartWidth <= 0) {
    return false;
  }
  const numDots =
    seriesSettings["line.missing"] !== "none"
      ? dataset.length
      : dataset.filter(datum => datum[seriesModel.dataKey] != null).length;

  // symbolSize is the dot's diameter
  return chartWidth / numDots > CHART_STYLE.symbolSize;
}

const buildEChartsLineAreaSeries = (
  seriesModel: SeriesModel,
  seriesSettings: SeriesSettings,
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  dimensionDataKey: string,
  yAxisIndex: number,
  hasMultipleSeries: boolean,
  chartWidth: number,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["line"] => {
  const display = seriesSettings?.display ?? "line";

  const stackName =
    settings["stackable.stack_type"] != null ? `area_${yAxisIndex}` : undefined;

  return {
    emphasis: {
      focus: hasMultipleSeries ? "series" : "self",
      itemStyle: {
        color: seriesModel.color,
      },
    },
    blur: {
      label: {
        show: settings["graph.show_values"] && !hasMultipleSeries,
      },
      itemStyle: {
        opacity: 0.3,
      },
    },
    zlevel: CHART_STYLE.series.zIndex,
    id: seriesModel.dataKey,
    type: "line",
    yAxisIndex,
    showSymbol: getShowSymbol(seriesModel, seriesSettings, dataset, chartWidth),
    symbolSize: CHART_STYLE.symbolSize,
    smooth: seriesSettings["line.interpolate"] === "cardinal",
    connectNulls: seriesSettings["line.missing"] === "interpolate",
    step:
      seriesSettings["line.interpolate"] === "step-after" ? "end" : undefined,
    stack: stackName,
    areaStyle: display === "area" ? { opacity: 0.3 } : undefined,
    encode: {
      y: seriesModel.dataKey,
      x: dimensionDataKey,
    },
    label: buildEChartsLabelOptions(
      seriesModel,
      settings,
      renderingContext,
      settings["graph.show_values"] && stackName == null,
      "top",
    ),
    labelLayout: {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
    },
    itemStyle: {
      color: seriesModel.color,
    },
  };
};

const generateStackOption = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  signKey: StackTotalDataKey,
  stackDataKeys: DataKey[],
  seriesOptionFromStack: EChartsSeriesOption,
  renderingContext: RenderingContext,
) => {
  const seriesModel = chartModel.seriesModels.find(
    s => s.dataKey === stackDataKeys[0],
  );

  if (!seriesModel) {
    return null;
  }

  const stackName = seriesOptionFromStack.stack;

  return {
    yAxisIndex: seriesOptionFromStack.yAxisIndex,
    silent: true,
    symbolSize: 0,
    lineStyle: {
      opacity: 0,
    },
    type: seriesOptionFromStack.type,
    id: `${stackName}_${signKey}`,
    stack: stackName,
    encode: {
      y: signKey,
      x: chartModel.dimensionModel.dataKey,
    },
    label: {
      ...seriesOptionFromStack.label,
      position: signKey === "positiveStackTotal" ? "top" : "bottom",
      show: true,
      formatter: (
        params: LabelLayoutOptionCallbackParams & { data: Datum },
      ) => {
        let stackValue: number | null = null;
        stackDataKeys.forEach(stackDataKeys => {
          const seriesValue = params.data[stackDataKeys];
          if (
            typeof seriesValue === "number" &&
            ((signKey === "positiveStackTotal" && seriesValue > 0) ||
              (signKey === "negativeStackTotal" && seriesValue < 0))
          ) {
            stackValue = (stackValue ?? 0) + seriesValue;
          }
        });

        if (stackValue === null) {
          return " ";
        }

        const valueGetter = getMetricDisplayValueGetter(settings);
        const valueFormatter = (value: RowValue) =>
          renderingContext.formatValue(valueGetter(value), {
            ...(settings.column?.(seriesModel.column) ?? {}),
            jsx: false,
            compact: settings["graph.label_value_formatting"] === "compact",
          });

        return valueFormatter(stackValue);
      },
    },
    labelLayout: {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
    },
    zlevel: CHART_STYLE.series.zIndex,
  };
};

export const getStackTotalsSeries = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  seriesOptions: EChartsSeriesOption[],
  renderingContext: RenderingContext,
) => {
  const seriesByStackName = _.groupBy(
    seriesOptions.filter(s => s.stack != null),
    "stack",
  );

  return getObjectValues(seriesByStackName).flatMap(seriesOptions => {
    const stackDataKeys = seriesOptions // we set string dataKeys as series IDs
      .map(s => s.id)
      .filter(isNotNull) as string[];
    const firstSeriesInStack = seriesOptions[0];

    return [
      generateStackOption(
        chartModel,
        settings,
        "positiveStackTotal",
        stackDataKeys,
        firstSeriesInStack,
        renderingContext,
      ),
      generateStackOption(
        chartModel,
        settings,
        "negativeStackTotal",
        stackDataKeys,
        firstSeriesInStack,
        renderingContext,
      ),
    ];
  });
};

export const buildEChartsSeries = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  chartWidth: number,
  renderingContext: RenderingContext,
): EChartsSeriesOption[] => {
  const seriesSettingsByDataKey = chartModel.seriesModels.reduce(
    (acc, seriesModel) => {
      acc[seriesModel.dataKey] = settings.series(
        seriesModel.legacySeriesSettingsObjectKey,
      );
      return acc;
    },
    {} as Record<DataKey, SeriesSettings>,
  );

  const barSeriesCount = Object.values(seriesSettingsByDataKey).filter(
    seriesSettings => seriesSettings.display === "bar",
  ).length;

  const hasMultipleSeries = chartModel.seriesModels.length > 1;

  const series = chartModel.seriesModels
    .map(seriesModel => {
      const seriesSettings = seriesSettingsByDataKey[seriesModel.dataKey];
      const yAxisIndex = getSeriesYAxisIndex(seriesModel, chartModel);

      switch (seriesSettings.display) {
        case "line":
        case "area":
          return buildEChartsLineAreaSeries(
            seriesModel,
            seriesSettings,
            chartModel.dataset,
            settings,
            chartModel.dimensionModel.dataKey,
            yAxisIndex,
            hasMultipleSeries,
            chartWidth,
            renderingContext,
          );
        case "bar":
          return buildEChartsBarSeries(
            chartModel.transformedDataset,
            seriesModel,
            settings,
            chartModel.dimensionModel.dataKey,
            yAxisIndex,
            barSeriesCount,
            hasMultipleSeries,
            renderingContext,
          );
        case "scatter":
          return buildEChartsScatterSeries(
            seriesModel,
            chartModel.bubbleSizeDomain,
            chartModel.dataset,
            chartModel.dimensionModel.dataKey,
            yAxisIndex,
            renderingContext,
          );
        case "waterfall":
          return buildEChartsWaterfallSeries(
            seriesModel,
            chartModel.dataset,
            settings,
            checkWaterfallChartModel(chartModel).total,
            renderingContext,
          );
      }
    })
    .flat()
    .filter(isNotNull);

  if (
    settings["stackable.stack_type"] === "stacked" &&
    settings["graph.show_values"]
  ) {
    series.push(
      // @ts-expect-error TODO: figure out ECharts series option types
      ...getStackTotalsSeries(chartModel, settings, series, renderingContext),
    );
  }

  // @ts-expect-error TODO: figure out ECharts series option types
  return series;
};
