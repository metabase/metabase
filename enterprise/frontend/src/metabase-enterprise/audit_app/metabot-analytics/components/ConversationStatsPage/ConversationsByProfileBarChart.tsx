import { renderMetabotProfileLabel } from "metabase/metabot/constants";
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

export function ConversationsByProfileBarChart({
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
