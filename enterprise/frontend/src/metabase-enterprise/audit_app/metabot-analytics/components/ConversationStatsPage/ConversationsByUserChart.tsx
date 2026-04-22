import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";
import { type UsageStatsMetric, getChartTitle } from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  metric: UsageStatsMetric;
  onDimensionClick?: (value: unknown) => void;
  h?: number;
};

export function ConversationsByUserChart({
  dateFilter,
  metric,
  onDimensionClick,
  h,
}: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      breakoutColumn="user_display_name"
      title={getChartTitle(metric, "user")}
      metric={metric}
      onDimensionClick={onDimensionClick}
      h={h}
    />
  );
}
