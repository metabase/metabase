import { ComboChart } from "metabase/static-viz/components/ComboChart";
import { computeFunnelBarChartSettings } from "metabase/static-viz/components/FunnelBarChart/settings";
import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { registerVisualization } from "metabase/visualizations";
import { Funnel } from "metabase/visualizations/visualizations/Funnel";
import { funnelToBarTransform } from "metabase/visualizations/visualizations/Funnel/funnel-bar-transform";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Funnel);

export const FunnelBarChart = (props: StaticChartProps) => {
  const barSeries = funnelToBarTransform(
    props.rawSeries,
    computeFunnelBarChartSettings(props.rawSeries, props.dashcardSettings),
    props.renderingContext,
  );

  return <ComboChart {...props} rawSeries={barSeries} />;
};
