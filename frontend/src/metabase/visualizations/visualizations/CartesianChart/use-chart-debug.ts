/* eslint-disable no-console */
import type { EChartsOption } from "echarts";
import { useEffect } from "react";

import { isProduction } from "metabase/env";
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
  option: EChartsOption;
  chartModel: BaseCartesianChartModel;
}) {
  useEffect(() => {
    if (!isQueryBuilder || isProduction) {
      return;
    }
    console.log("-------------- ECHARTS DEBUG INFO START --------------");
    console.log("rawSeries", rawSeries);
    console.log("option", option);
    console.log("model", chartModel);
    console.log("-------------- ECHARTS DEBUG INFO END --------------");
  }, [rawSeries, option, chartModel, isQueryBuilder]);
}
