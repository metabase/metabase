import { init } from "echarts";
import { Group } from "@visx/group";
import type { IsomorphicChartProps } from "metabase/static-viz/types";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/echarts";
import { buildComboChart } from "metabase/visualizations/shared/echarts/combo/option";
import { computeStaticComboChartSettings } from "metabase/static-viz/components/ComboChart/settings";

// FIXME: creepy way to replace <text> svg elements with both fill and stroke with two separate ones
// because Batik ignores paint-order and there is no DomParser on GraalVM environment available.
// use any svg parser instead of regex mess
const transformSvgForOutline = (svgString: string) => {
  const regex =
    /<text([^>]*fill="([^"]+)"[^>]*stroke="([^"]+)"[^>]*)>(.*?)<\/text>/g;

  return svgString.replace(
    regex,
    function (match, attributes, fill, stroke, innerText) {
      const strokeElem = `<text${attributes.replace(
        `fill="${fill}"`,
        'fill="none"',
      )}>${innerText}</text>`;
      const fillElem = `<text${attributes
        .replace(`stroke="${stroke}"`, 'stroke="none"')
        .replace(
          `stroke-width="[^"]+"`,
          'stroke-width="0"',
        )}>${innerText}</text>`;

      return strokeElem + fillElem;
    },
  );
};

const WIDTH = 540;
const HEIGHT = 360;

export const ComboChart = ({
  rawSeries,
  environment,
}: IsomorphicChartProps) => {
  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width: WIDTH,
    height: HEIGHT,
  });

  const computedVisualizationSettings =
    computeStaticComboChartSettings(rawSeries);

  const { option } = buildComboChart(
    rawSeries,
    computedVisualizationSettings,
    environment,
  );

  chart.setOption(option);

  const chartSvg = sanitizeSvgForBatik(
    transformSvgForOutline(chart.renderToSVGString()),
  );

  // const { height: legendHeight, items } = calculateLegendRows(
  //   legend.map(legendItem => ({
  //     name: legendItem.title.join(" — "),
  //     color: legendItem.color,
  //   })),
  //   WIDTH,
  //   24,
  //   18,
  //   400,
  // )!;

  const legendHeight = 0;

  return (
    <svg width={WIDTH} height={HEIGHT + legendHeight}>
      <Group dangerouslySetInnerHTML={{ __html: chartSvg }}></Group>
      {/*<Group top={HEIGHT}>*/}
      {/*  <Legend fontSize={18} fontWeight={400} items={items} />*/}
      {/*</Group>*/}
    </svg>
  );
};
