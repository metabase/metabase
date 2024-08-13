/* eslint-disable no-console */
import type { EChartsCoreOption } from "echarts/core";
import { useEffect } from "react";

import { isChartsDebugLoggingEnabled } from "metabase/env";
import type { BaseCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import type { RawSeries } from "metabase-types/api";

export function useChartDebug({
  isQueryBuilder,
  rawSeries,
  option,
  chartModel,
}: {
  isQueryBuilder: boolean;
  rawSeries: RawSeries;
  option: EChartsCoreOption;
  chartModel: BaseCartesianChartModel;
}) {
  useEffect(() => {
    if (!isQueryBuilder || !isChartsDebugLoggingEnabled) {
      return;
    }
    console.log("-------------- ECHARTS DEBUG INFO START --------------");
    console.log("rawSeries", rawSeries);
    console.log("option", option);
    console.log("model", chartModel);
    console.log("-------------- ECHARTS DEBUG INFO END --------------");
  }, [rawSeries, option, chartModel, isQueryBuilder]);
}
