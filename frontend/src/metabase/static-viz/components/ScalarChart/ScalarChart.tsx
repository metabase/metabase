import { ComboChart } from "metabase/static-viz/components/ComboChart";
import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { scalarToBarTransform } from "metabase/visualizations/visualizations/Scalar/scalars-bar-transform";

export const ScalarChart = (props: StaticChartProps) => {
  return (
    <ComboChart
      {...props}
      rawSeries={scalarToBarTransform(
        props.rawSeries,
        {},
        props.renderingContext,
      )}
    />
  );
};
