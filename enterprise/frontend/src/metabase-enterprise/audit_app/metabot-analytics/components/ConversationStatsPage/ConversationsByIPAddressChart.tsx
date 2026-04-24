import { t } from "ttag";

import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";

import { BreakoutChart } from "./BreakoutChart";
import { type StatsFilters, getChartTitle } from "./query-utils";

type Props = StatsFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  onDimensionClick?: (value: unknown) => void;
  h?: number;
};

export function ConversationsByIPAddressChart({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  metric,
  onDimensionClick,
  h,
}: Props) {
  return (
    <BreakoutChart
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      dateFilter={dateFilter}
      userId={userId}
      groupId={groupId}
      breakoutColumn="ip_address"
      title={getChartTitle(metric, "ip_address")}
      metric={metric}
      onDimensionClick={onDimensionClick}
      h={h}
      nullLabel={t`Unknown`}
    />
  );
}
