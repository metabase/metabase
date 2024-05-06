/* eslint-disable no-console */
import type { EChartsOption } from "echarts";
import { useEffect } from "react";

import { isProduction } from "metabase/env";
import type { RawSeries } from "metabase-types/api";

export function useChartDebug({
  isQueryBuilder,
  rawSeries,
  option,
}: {
  isQueryBuilder: boolean;
  rawSeries: RawSeries;
  option: EChartsOption;
}) {
  useEffect(() => {
    if (!isQueryBuilder || isProduction) {
      return;
    }
    console.log("-------------- ECHARTS DEBUG INFO START --------------");
    console.log("rawSeries", rawSeries);
    console.log("option", option);
    console.log("-------------- ECHARTS DEBUG INFO END --------------");
  }, [rawSeries, option, isQueryBuilder]);
}
