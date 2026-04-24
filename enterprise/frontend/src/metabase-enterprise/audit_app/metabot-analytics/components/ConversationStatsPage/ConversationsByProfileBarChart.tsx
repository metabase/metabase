import { renderMetabotProfileLabel } from "metabase/metabot/constants";
import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";
import { type UsageStatsMetric, getChartTitle } from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  userId?: number;
  groupName?: string;
  metric: UsageStatsMetric;
  viewName?: string;
  onDimensionClick?: (value: unknown) => void;
};

export function ConversationsByProfileBarChart({
  dateFilter,
  userId,
  groupName,
  metric,
  viewName,
  onDimensionClick,
}: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      userId={userId}
      groupName={groupName}
      breakoutColumn="profile_id"
      title={getChartTitle(metric, "profile")}
      display="bar"
      metric={metric}
      viewName={viewName}
      onDimensionClick={onDimensionClick}
      transformDimension={renderMetabotProfileLabel}
    />
  );
}
