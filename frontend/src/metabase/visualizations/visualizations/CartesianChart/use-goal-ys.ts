import type { EChartsType } from "echarts/core";
import { useEffect, useState } from "react";
import _ from "underscore";

type UseGoalYsParams = {
  axisValue: number | null;
  chartInstance: EChartsType | undefined;
  yAxisCount: number;
};

export function useGoalYs({
  axisValue,
  chartInstance,
  yAxisCount,
}: UseGoalYsParams) {
  const [goalYs, setGoalYs] = useState<number[]>([]);

  useEffect(() => {
    function updateGoalYs() {
      const next =
        chartInstance != null && axisValue != null
          ? _.range(yAxisCount).map((yAxisIndex) =>
              chartInstance.convertToPixel({ yAxisIndex }, axisValue),
            )
          : [];
      setGoalYs((previous) => (_.isEqual(previous, next) ? previous : next));
    }

    updateGoalYs();
    chartInstance?.on("finished", updateGoalYs);

    return () => {
      if (chartInstance != null && !chartInstance.isDisposed()) {
        chartInstance.off("finished", updateGoalYs);
      }
    };
  }, [axisValue, chartInstance, yAxisCount]);

  return goalYs;
}
