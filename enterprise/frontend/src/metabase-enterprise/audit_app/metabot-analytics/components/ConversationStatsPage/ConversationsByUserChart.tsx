import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";
import { type UsageStatsMetric, getChartTitle } from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  metric: UsageStatsMetric;
};

export function ConversationsByUserChart({ dateFilter, metric }: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      breakoutColumn="user_display_name"
      title={getChartTitle(metric, "user")}
      metric={metric}
    />
  );
}
