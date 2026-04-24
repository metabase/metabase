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
};

export function ConversationsBySourceChart({
  dateFilter,
  userId,
  groupId,
  groupMembersTable,
  metric,
  viewName,
  onDimensionClick,
}: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      userId={userId}
      groupId={groupId}
      groupMembersTable={groupMembersTable}
      breakoutColumn="source"
      title={getChartTitle(metric, "source")}
      display="bar"
      metric={metric}
      viewName={viewName}
      onDimensionClick={onDimensionClick}
    />
  );
}
