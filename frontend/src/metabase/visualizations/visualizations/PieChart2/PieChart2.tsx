import type { VisualizationProps } from "metabase/visualizations/types";
import { EChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { measureTextWidth } from "metabase/lib/measure-text";
import { formatValue } from "metabase/lib/formatting/value";
import { color } from "metabase/lib/colors";
import type { OptionsType } from "metabase/lib/formatting/types";
import PieChart from "../PieChart/PieChart";

Object.assign(PieChart2, {
  uiName: "Pie 2",
  identifier: "pie2",
  iconName: "pie",
  settings: PieChart.settings,
});

// Only using this for testing, will
// remove from this branch before merging
export function PieChart2(props: VisualizationProps) {
  const model = getPieChartModel(props.rawSeries, props.settings, {
    getColor: color,
    formatValue: (value, options) =>
      formatValue(value, options as OptionsType) as string,
    measureText: measureTextWidth,
    fontFamily: props.fontFamily,
  });
  //eslint-disable-next-line
  console.log("model", model);

  return (
    <EChartsRenderer
      option={{
        series: {
          type: "sunburst",
          data: [
            { name: "slice1", value: 20 },
            { name: "slice2", value: 30 },
          ],
        },
      }}
      width={props.width}
      height={props.height}
      eventHandlers={[]}
      zrEventHandlers={[]}
    />
  );
}
