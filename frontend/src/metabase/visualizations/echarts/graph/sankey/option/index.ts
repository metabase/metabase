import type { SankeySeriesOption } from "echarts/charts";
import type { EChartsCoreOption } from "echarts/core";

import type { RenderingContext } from "metabase/visualizations/types";

import type { SankeyChartLayout } from "../../layout/types";
import type { SankeyChartModel } from "../../model/types";
import { SANKEY_CHART_STYLE } from "../constants/style";

export const getSankeyChartOption = (
  sankeyChartModel: SankeyChartModel,
  layout: SankeyChartLayout,
  renderingContext: RenderingContext,
): EChartsCoreOption => {
  const data = sankeyChartModel.data.levels.flat().map(name => ({
    name,
  }));
  const links = sankeyChartModel.data.links;

  const series: SankeySeriesOption = {
    ...layout.padding,
    edgeLabel: { show: true },
    type: "sankey",
    draggable: false,
    data,
    links,
    lineStyle: {
      color: "gradient",
      curveness: 0.5,
    },
    label: {
      color: renderingContext.getColor("text-dark"),
      fontSize: SANKEY_CHART_STYLE.nodeLabels.size,
      textBorderWidth: SANKEY_CHART_STYLE.nodeLabels.textBorderWidth,
      textBorderColor: renderingContext.getColor("white"),
    },
  };

  return {
    animation: false,
    series,
  };
};
