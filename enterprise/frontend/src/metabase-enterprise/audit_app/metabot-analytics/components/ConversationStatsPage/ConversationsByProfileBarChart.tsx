import { renderMetabotProfileLabel } from "metabase/metabot/constants";
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
};

export function ConversationsByProfileBarChart({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  metric,
  onDimensionClick,
}: Props) {
  return (
    <BreakoutChart
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      dateFilter={dateFilter}
      userId={userId}
      groupId={groupId}
      breakoutColumn="profile_id"
      title={getChartTitle(metric, "profile")}
      display="bar"
      metric={metric}
      onDimensionClick={onDimensionClick}
      transformDimension={renderMetabotProfileLabel}
    />
  );
}
