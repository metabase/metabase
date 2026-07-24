import { useMemo } from "react";
import { t } from "ttag";

import { Skeleton } from "metabase/ui";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

import { BreakoutChartCard } from "../../metabot-analytics/components/ConversationStatsPage/BreakoutChartCard";
import { useAdhocBreakoutQuery } from "../../metabot-analytics/hooks/useAdhocBreakoutQuery";
import type { CliFilters } from "../query-utils";
import { buildCallerLivenessQuery } from "../query-utils";

const TABLE_HEIGHT = 500;

type DataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
};

type Props = DataSources &
  CliFilters & {
    title: string;
    h?: number;
  };

type InnerProps = CliFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  title: string;
  h: number;
};

/**
 * Wrap the caller-liveness result (one row per caller: last-seen timestamp + call count) as a
 * single-card table rawSeries. The result has one breakout column (the caller/user) and two
 * aggregations in build order — `max(created_at)` then `count` — which we relabel "User",
 * "Last seen", and "Calls". Returns null before the first result resolves.
 */
export function buildLivenessRawSeries(
  data: ReturnType<typeof useAdhocBreakoutQuery>["data"],
  jsQuery: DatasetQuery | null,
) {
  if (!data?.data || !jsQuery) {
    return null;
  }
  const { cols } = data.data;
  const dimensionCol = cols.find((col) => col.source === "breakout");
  const [lastSeenCol, callsCol] = cols.filter(
    (col) => col.source === "aggregation",
  );
  if (!dimensionCol || !lastSeenCol || !callsCol) {
    return null;
  }

  // Relabel the surfaced columns; row data is left untouched so columns stay aligned.
  const titles: Record<string, string> = {
    [dimensionCol.name]: t`User`,
    [lastSeenCol.name]: t`Last seen`,
    [callsCol.name]: t`Calls`,
  };
  const renamedCols = cols.map((col) =>
    titles[col.name] ? { ...col, display_name: titles[col.name] } : col,
  );

  return [
    {
      card: {
        display: "table",
        dataset_query: jsQuery,
        visualization_settings: {
          "table.columns": [
            { name: dimensionCol.name, enabled: true },
            { name: lastSeenCol.name, enabled: true },
            { name: callsCol.name, enabled: true },
          ],
        },
      },
      data: { ...data.data, cols: renamedCols },
    },
  ];
}

/**
 * Caller-liveness table — last-seen timestamp and call count per caller (user), so an admin can
 * spot who's still active and who's gone quiet. Renders a skeleton until the audit metadata is
 * loaded, then delegates to the inner component.
 */
export function CliCallerLivenessTable({
  provider,
  table,
  groupMembersTable,
  h = TABLE_HEIGHT,
  ...rest
}: Props) {
  if (!provider || !table || !groupMembersTable) {
    return <Skeleton h={h} />;
  }
  return (
    <CliCallerLivenessTableInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      h={h}
      {...rest}
    />
  );
}

function CliCallerLivenessTableInner({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  title,
  h,
}: InnerProps) {
  const query = useMemo(
    () =>
      buildCallerLivenessQuery({
        provider,
        table,
        groupMembersTable,
        dateFilter,
        userId,
        groupId,
        tenantId,
      }),
    [provider, table, groupMembersTable, dateFilter, userId, groupId, tenantId],
  );

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);

  const rawSeries = useMemo(
    () => buildLivenessRawSeries(data, jsQuery),
    [data, jsQuery],
  );

  return (
    <BreakoutChartCard
      title={title}
      rawSeries={rawSeries}
      isFetching={isFetching}
      display="table"
      h={h}
      otherLabel={t`Other`}
    />
  );
}
