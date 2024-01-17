import type { IsomorphicStaticChartProps } from "metabase/static-viz/containers/IsomorphicStaticChart/types";
import { scalarToBarTransform } from "metabase/visualizations/visualizations/Scalar/scalars-bar-transform";
import { ComboChart } from "metabase/static-viz/components/ComboChart";

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
