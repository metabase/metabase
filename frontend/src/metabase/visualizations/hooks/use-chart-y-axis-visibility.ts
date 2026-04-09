import type { EChartsType } from "echarts/core";
import { useLayoutEffect, useMemo } from "react";

import type {
  DataKey,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { createAxisVisibilityOption } from "metabase/visualizations/echarts/cartesian/option/axis";
import type { HoveredObject } from "metabase/visualizations/types";
import { getHoveredSeriesDataKey } from "metabase/visualizations/visualizations/CartesianChart/utils";

type UseChartYAxisVisibilityProps = {
  chartRef: React.RefObject<EChartsType | undefined>;
  seriesModels: SeriesModel[];
  leftAxisModel: unknown | null;
  rightAxisModel: unknown | null;
  leftAxisSeriesKeys: Set<DataKey> | DataKey[];
  hovered: HoveredObject | null | undefined;
};

export function useChartYAxisVisibility({
  chartRef,
  seriesModels,
  leftAxisModel,
  rightAxisModel,
  leftAxisSeriesKeys,
  hovered,
}: UseChartYAxisVisibilityProps) {
  const hoveredSeriesDataKey = useMemo(
    () => getHoveredSeriesDataKey(seriesModels, hovered),
    [seriesModels, hovered],
  );

  useLayoutEffect(
    function updateYAxisVisibility() {
      const hasDualYAxis = leftAxisModel != null && rightAxisModel != null;

      if (!hasDualYAxis) {
        return;
      }

      let yAxisShowOption: ReturnType<typeof createAxisVisibilityOption>[];

      const noSeriesHovered = hoveredSeriesDataKey == null;
      const leftAxisHasHoveredSeries =
        hoveredSeriesDataKey != null &&
        (leftAxisSeriesKeys instanceof Set
          ? leftAxisSeriesKeys.has(hoveredSeriesDataKey)
          : leftAxisSeriesKeys.includes(hoveredSeriesDataKey));

      if (noSeriesHovered) {
        yAxisShowOption = [
          createAxisVisibilityOption({ show: true, splitLineVisible: true }),
          createAxisVisibilityOption({ show: true, splitLineVisible: false }),
        ];
      } else if (leftAxisHasHoveredSeries) {
        yAxisShowOption = [
          createAxisVisibilityOption({ show: true, splitLineVisible: true }),
          createAxisVisibilityOption({ show: false, splitLineVisible: false }),
        ];
      } else {
        yAxisShowOption = [
          createAxisVisibilityOption({ show: false, splitLineVisible: false }),
          createAxisVisibilityOption({ show: true, splitLineVisible: true }),
        ];
      }

      chartRef.current?.setOption({ yAxis: yAxisShowOption }, false, true);
    },
    [
      leftAxisModel,
      rightAxisModel,
      leftAxisSeriesKeys,
      chartRef,
      hoveredSeriesDataKey,
    ],
  );
}
