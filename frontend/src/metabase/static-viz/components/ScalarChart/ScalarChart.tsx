import { ComboChart } from "metabase/static-viz/components/ComboChart";
import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { scalarToBarTransform } from "metabase/visualizations/visualizations/Scalar/scalars-bar-transform";

export const ScalarChart = (props: StaticChartProps) => {
  const barSeries = scalarToBarTransform(
    props.rawSeries,
    {},
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
