import type { RenderingContext } from "metabase/visualizations/types";

import type { SankeyChartModel } from "../model/types";
import { SANKEY_CHART_STYLE } from "../sankey/constants/style";

import type { SankeyChartLayout } from "./types";

export const getSankeyLayout = (
  chartModel: SankeyChartModel,
  renderingContext: RenderingContext,
): SankeyChartLayout => {
  const padding = {
    top: SANKEY_CHART_STYLE.padding.y,
    right: SANKEY_CHART_STYLE.padding.x,
    bottom: SANKEY_CHART_STYLE.padding.y,
    left: SANKEY_CHART_STYLE.padding.x,
  };

  const mostRightNodes =
    chartModel.data.levels[chartModel.data.levels.length - 1];

  const maxRightLabelWidth = Math.max(
    ...mostRightNodes
      .map(node => chartModel.formatters.target(node))
      .map(formattedNode =>
        renderingContext.measureText(formattedNode, {
          ...SANKEY_CHART_STYLE.nodeLabels,
          family: renderingContext.fontFamily,
        }),
      ),
  );

  padding.right += maxRightLabelWidth;

  return { padding };
};
