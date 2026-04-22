import { t } from "ttag";

import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";
import { type UsageStatsMetric, getChartTitle } from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  metric: UsageStatsMetric;
  onDimensionClick?: (value: unknown) => void;
  h?: number;
};

export function ConversationsByIPAddressChart({
  dateFilter,
  metric,
  onDimensionClick,
  h,
}: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      breakoutColumn="ip_address"
      title={getChartTitle(metric, "ip_address")}
      metric={metric}
      onDimensionClick={onDimensionClick}
      h={h}
      nullLabel={t`Unknown`}
    />
  );
}
