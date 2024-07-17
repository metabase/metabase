import { ComboChart } from "metabase/static-viz/components/ComboChart";
import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { scalarToCartesianTransform } from "metabase/visualizations/visualizations/Scalar/scalars-cartesian-transform";

export const ScalarChart = (props: StaticChartProps) => {
  return (
    <ComboChart
      {...props}
      rawSeries={scalarToCartesianTransform(
        props.rawSeries,
        {},
        props.renderingContext,
      )}
    />
  );
};
