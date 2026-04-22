import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";
import { type UsageStatsMetric, getChartTitle } from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  metric: UsageStatsMetric;
  viewName?: string;
  onDimensionClick?: (value: unknown) => void;
  h?: number;
};

export function ConversationsByGroupChart({
  dateFilter,
  metric,
  viewName,
  onDimensionClick,
  h,
}: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      breakoutColumn="group_name"
      title={getChartTitle(metric, "group")}
      metric={metric}
      viewName={viewName}
      onDimensionClick={onDimensionClick}
      h={h}
    />
  );
}
