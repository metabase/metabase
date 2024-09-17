import { ComboChart } from "metabase/static-viz/components/ComboChart";
import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { funnelToBarTransform } from "metabase/visualizations/visualizations/Funnel/funnel-bar-transform";

export const FunnelBarChart = (props: StaticChartProps) => {
  const barSeries = funnelToBarTransform(
    props.rawSeries,
    {},
    props.renderingContext,
  );

  return <ComboChart {...props} rawSeries={barSeries} />;
};
