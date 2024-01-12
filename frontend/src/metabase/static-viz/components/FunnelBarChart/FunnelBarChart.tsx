import type { IsomorphicStaticChartProps } from "metabase/static-viz/containers/IsomorphicStaticChart/types";
import { ComboChart } from "metabase/static-viz/components/ComboChart";
import { funnelToBarTransform } from "metabase/visualizations/visualizations/Funnel/funnel-bar-transform";
import { computeFunnelBarChartSettings } from "metabase/static-viz/components/FunnelBarChart/settings";

export const FunnelBarChart = (props: IsomorphicStaticChartProps) => {
  const barSeries = funnelToBarTransform(
    props.rawSeries,
    computeFunnelBarChartSettings(props.rawSeries, props.dashcardSettings),
    props.renderingContext,
  );

  return <ComboChart {...props} rawSeries={barSeries} />;
};
