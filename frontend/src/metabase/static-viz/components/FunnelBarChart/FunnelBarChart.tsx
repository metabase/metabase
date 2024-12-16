import { ComboChart } from "metabase/static-viz/components/ComboChart";
import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { funnelToBarTransform } from "metabase/visualizations/visualizations/Funnel/funnel-bar-transform";

export const FunnelBarChart = (props: StaticChartProps) => {
  const barSeries = funnelToBarTransform(
    props.rawSeries,
    props.settings,
    props.renderingContext,
  );

  return (
    <ComboChart
      {...props}
      settings={getComputedSettingsForSeries(barSeries)}
      rawSeries={barSeries}
    />
  );
};
