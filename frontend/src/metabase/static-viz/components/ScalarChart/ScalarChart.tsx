import { ComboChart } from "metabase/static-viz/components/ComboChart";
import type { IsomorphicStaticChartProps } from "metabase/static-viz/containers/IsomorphicStaticChart/types";
import { scalarToBarTransform } from "metabase/visualizations/visualizations/Scalar/scalars-bar-transform";

export const ScalarChart = (props: IsomorphicStaticChartProps) => {
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
