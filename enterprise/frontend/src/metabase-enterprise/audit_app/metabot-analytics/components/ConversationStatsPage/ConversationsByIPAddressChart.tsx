import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";
import { type UsageStatsMetric, getChartTitle } from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  metric: UsageStatsMetric;
};

export function ConversationsByIPAddressChart({ dateFilter, metric }: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      breakoutColumn="ip_address"
      title={getChartTitle(metric, "ip_address")}
      metric={metric}
    />
  );
}
