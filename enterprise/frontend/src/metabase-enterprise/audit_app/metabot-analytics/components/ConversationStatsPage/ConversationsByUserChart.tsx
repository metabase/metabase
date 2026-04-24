import type { DateFilterValue } from "metabase/querying/common/types";
import type { CardMetadata, TableMetadata } from "metabase-lib";

import { BreakoutChart } from "./BreakoutChart";
import { type UsageStatsMetric, getChartTitle } from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  userId?: number;
  groupId?: number;
  groupMembersTable?: TableMetadata | CardMetadata | null;
  metric: UsageStatsMetric;
  viewName?: string;
  onDimensionClick?: (value: unknown) => void;
  h?: number;
};

export function ConversationsByUserChart({
  dateFilter,
  userId,
  groupId,
  groupMembersTable,
  metric,
  viewName,
  onDimensionClick,
  h,
}: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      userId={userId}
      groupId={groupId}
      groupMembersTable={groupMembersTable}
      breakoutColumn="user_display_name"
      title={getChartTitle(metric, "user")}
      metric={metric}
      viewName={viewName}
      onDimensionClick={onDimensionClick}
      h={h}
    />
  );
}
