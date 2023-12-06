import { init } from "echarts";
import type { IsomorphicStaticChartProps } from "metabase/static-viz/containers/IsomorphicStaticChart/types";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";

const WIDTH = 540;
const HEIGHT = 360;

export function PieChart(props: IsomorphicStaticChartProps) {
  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width: WIDTH,
    height: HEIGHT,
  });
  chart.setOption({
    // Mock data, will be replaced
    series: {
      type: "sunburst",
      data: [
        { name: "slice1", value: 20 },
        { name: "slice2", value: 30 },
      ],
    },
  });
  const svg = sanitizeSvgForBatik(chart.renderToSVGString());

  return (
    <svg width={WIDTH} height={HEIGHT}>
      <g dangerouslySetInnerHTML={{ __html: svg }}></g>
    </svg>
  );
}
