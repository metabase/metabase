import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";
import { type UsageStatsMetric, getChartTitle } from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  metric: UsageStatsMetric;
};

export function ConversationsBySourceChart({ dateFilter, metric }: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      breakoutColumn="source"
      title={getChartTitle(metric, "source")}
      display="bar"
      metric={metric}
    />
  );
}
