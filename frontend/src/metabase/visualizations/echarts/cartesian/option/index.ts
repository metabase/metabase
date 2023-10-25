import type { EChartsOption } from "echarts";
import type { CartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import { buildEChartsSeries } from "metabase/visualizations/echarts/cartesian/option/series";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import { buildAxes } from "metabase/visualizations/echarts/cartesian/option/axis";

export const getCartesianChartOption = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): EChartsOption => {
  const echartsSeries = buildEChartsSeries(
    chartModel.flatMap(cardModel => cardModel.series),
    settings,
    renderingContext,
  );

  const echartsDataset = chartModel.map(cardModel => {
    const dimensions = [
      cardModel.series.dimension.dataKey,
      ...cardModel.series.metrics.map(s => s.dataKey),
    ];

    return { source: cardModel.dataset, dimensions };
  });

  const mainCard = chartModel[0];

  return {
    dataset: echartsDataset,
    series: echartsSeries,
    ...buildAxes(mainCard.series, settings, renderingContext),
  } as EChartsOption;
};
