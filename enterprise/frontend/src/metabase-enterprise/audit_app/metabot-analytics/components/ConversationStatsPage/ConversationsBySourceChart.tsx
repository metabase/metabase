import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";
import { type UsageStatsMetric, getChartTitle } from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  metric: UsageStatsMetric;
  onDimensionClick?: (value: unknown) => void;
};

export function ConversationsBySourceChart({
  dateFilter,
  metric,
  onDimensionClick,
}: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      breakoutColumn="source"
      title={getChartTitle(metric, "source")}
      display="bar"
      metric={metric}
      onDimensionClick={onDimensionClick}
    />
  );
}
