import { t } from "ttag";

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
  h?: number;
};

export function ConversationsByIPAddressChart({
  dateFilter,
  userId,
  groupName,
  metric,
  viewName,
  onDimensionClick,
  h,
}: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      userId={userId}
      groupName={groupName}
      breakoutColumn="ip_address"
      title={getChartTitle(metric, "ip_address")}
      metric={metric}
      viewName={viewName}
      onDimensionClick={onDimensionClick}
      h={h}
      nullLabel={t`Unknown`}
    />
  );
}
