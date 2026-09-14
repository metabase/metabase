import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import {
  getSankeyChartModel,
  getSankeyChartOption,
  getSankeyLayout,
  init,
} from "metabase/viz-core";

import Watermark from "../../watermark.svg?component";

const WIDTH = 540;
const HEIGHT = 360;

export const SankeyChart = ({
  rawSeries,
  settings,
  renderingContext,
  width = WIDTH,
  height = HEIGHT,
  isStorybook = false,
  hasDevWatermark = false,
}: StaticChartProps) => {
  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width,
    height,
  });

  const chartModel = getSankeyChartModel(rawSeries, settings);
  const layout = getSankeyLayout(
    chartModel,
    settings,
    width,
    height,
    renderingContext,
  );
  const option = getSankeyChartOption(
    chartModel,
    layout,
    settings,
    renderingContext,
  );

  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString(), isStorybook);
  chart.dispose();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height}>
      <g dangerouslySetInnerHTML={{ __html: chartSvg }}></g>
      {hasDevWatermark && (
        <Watermark
          x="0"
          y="0"
          height={height}
          width={width}
          preserveAspectRatio="xMinYMin slice"
          fill={renderingContext.getColor("text-secondary")}
          opacity={0.2}
        />
      )}
    </svg>
  );
};
