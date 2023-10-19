import type {
  RenderingContext,
  VisualizationProps,
} from "metabase/visualizations/types";
import { EChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { measureTextWidth } from "metabase/lib/measure-text";
import { formatValue } from "metabase/lib/formatting/value";
import { color } from "metabase/lib/colors";
import type { OptionsType } from "metabase/lib/formatting/types";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";
import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
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
  const renderingContext: RenderingContext = {
    getColor: color,
    formatValue: (value, options) =>
      formatValue(value, options as OptionsType) as string,
    measureText: measureTextWidth,
    fontFamily: props.fontFamily,
  };

  const chartModel = getPieChartModel(
    props.rawSeries,
    props.settings,
    renderingContext,
  );
  const formatters = getPieChartFormatters(
    chartModel,
    props.settings,
    renderingContext,
  );
  const option = getPieChartOption(
    chartModel,
    formatters,
    props.settings,
    renderingContext,
  );

  return (
    <EChartsRenderer
      option={option}
      width={props.width}
      height={props.height}
      eventHandlers={[]}
      zrEventHandlers={[]}
    />
  );
}
