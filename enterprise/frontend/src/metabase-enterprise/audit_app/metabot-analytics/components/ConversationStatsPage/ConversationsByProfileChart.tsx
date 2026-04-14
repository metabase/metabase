import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";
import { type UsageStatsMetric, getChartTitle } from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  metric: UsageStatsMetric;
};

export function ConversationsByProfileChart({ dateFilter, metric }: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      breakoutColumn="model"
      title={getChartTitle(metric, "profile")}
      metric={metric}
    />
  );
}
