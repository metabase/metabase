/* eslint-disable no-console */
import type { EChartsOption } from "echarts";
import type { RawSeries } from "metabase-types/api";
import { isProduction } from "metabase/env";

export function useChartDebug({
  isQueryBuilder,
  rawSeries,
  option,
}: {
  isQueryBuilder: boolean;
  rawSeries: RawSeries;
  option: EChartsOption;
}) {
  if (!isQueryBuilder || isProduction) {
    return;
  }
  console.log("-------------- ECHARTS DEBUG INFO START --------------");
  console.log("rawSeries", rawSeries);
  console.log("option", option);
  console.log("-------------- ECHARTS DEBUG INFO END --------------");
}
