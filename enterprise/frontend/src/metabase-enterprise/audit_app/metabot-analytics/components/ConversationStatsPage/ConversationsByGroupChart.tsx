import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";
import { type UsageStatsMetric, getChartTitle } from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  metric: UsageStatsMetric;
  onDimensionClick?: (value: unknown) => void;
};

export function ConversationsByGroupChart({
  dateFilter,
  metric,
  onDimensionClick,
}: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      breakoutColumn="group_name"
      title={getChartTitle(metric, "group")}
      metric={metric}
      onDimensionClick={onDimensionClick}
    />
  );
}
