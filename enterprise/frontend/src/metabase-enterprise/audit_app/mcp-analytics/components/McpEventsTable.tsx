import { useMemo } from "react";
import { t } from "ttag";

import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import type { DatasetQuery, TableColumnOrderSetting } from "metabase-types/api";

import { BreakoutChartCard } from "../../metabot-analytics/components/ConversationStatsPage/BreakoutChartCard";
import { useAdhocBreakoutQuery } from "../../metabot-analytics/hooks/useAdhocBreakoutQuery";
import type { McpFilters } from "../query-utils";
import { buildEventsQuery } from "../query-utils";

const EVENTS_LIMIT = 100;
const TABLE_HEIGHT = 600;

// Columns surfaced in the events table, in display order. Every other view column (raw ids,
// client_name, …) is hidden. `tenant_name` is only included when tenants are enabled, and
// `ip_address` only when PII retention is on (it's null otherwise); `error_type`/`error_message`
// are populated only for failed calls (error_message is gated by analytics-pii-retention-enabled).
function eventColumns(hasTenants: boolean, hasPii: boolean): string[] {
  return [
    "tool_call_id",
    "created_at",
    "tool_name",
    "client_display_name",
    "client_version",
    "user_display_name",
    ...(hasTenants ? ["tenant_name"] : []),
    ...(hasPii ? ["ip_address"] : []),
    "status",
    "duration_ms",
    "error_type",
    "error_message",
  ];
}

/** Sentence-case header overrides for the surfaced columns, keyed by view column name. */
function columnTitles(): Record<string, string> {
  return {
    tool_call_id: t`ID`,
    created_at: t`Created at`,
    tool_name: t`Tool`,
    client_display_name: t`Client`,
    client_version: t`Client version`,
    user_display_name: t`User`,
    tenant_name: t`Tenant`,
    ip_address: t`IP address`,
    status: t`Status`,
    duration_ms: t`Duration (ms)`,
    error_type: t`Error type`,
    error_message: t`Error message`,
  };
}

type Props = McpFilters & {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
  hasTenants: boolean;
  hasPii: boolean;
};

type InnerProps = McpFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  hasTenants: boolean;
  hasPii: boolean;
};

/**
 * Wrap a row-level dataset as a single-card table rawSeries for `<Visualization>`. Surfaces only
 * the {@link eventColumns} present in the result (in display order) with Sentence-case headers,
 * and explicitly hides every other view column. Returns null when there's no data yet.
 */
export function buildEventsRawSeries(
  data: ReturnType<typeof useAdhocBreakoutQuery>["data"],
  jsQuery: DatasetQuery | null,
  hasTenants: boolean,
  hasPii: boolean,
) {
  if (!data?.data || !jsQuery) {
    return null;
  }
  const titles = columnTitles();
  const { cols } = data.data;

  // Result column names are upper- or lower-cased depending on the warehouse (the audit DB is
  // H2, which upper-cases identifiers; Postgres lower-cases), so match case-insensitively and
  // key everything off the real column names.
  const colByLower = new Map(cols.map((col) => [col.name.toLowerCase(), col]));
  const shown = eventColumns(hasTenants, hasPii)
    .map((name) => colByLower.get(name)?.name)
    .filter((name): name is string => name != null);

  // Override each surfaced column's header. Row data is left untouched so columns stay aligned.
  const renamedCols = cols.map((col) => {
    const title = titles[col.name.toLowerCase()];
    return title ? { ...col, display_name: title } : col;
  });

  // Guard against an all-hidden table: if none of the curated columns are present (e.g. an
  // unexpected schema), fall back to the default table rather than disabling everything.
  if (shown.length === 0) {
    return [
      { card: { display: "table", dataset_query: jsQuery }, data: data.data },
    ];
  }

  // `table.columns` must enumerate EVERY column — the surfaced ones (ordered, enabled) followed
  // by the rest (disabled). Columns omitted from this list are otherwise appended to the table.
  const shownSet = new Set<string>(shown);
  const tableColumns: TableColumnOrderSetting[] = [
    ...shown.map((name) => ({ name, enabled: true })),
    ...cols
      .map((col) => col.name)
      .filter((name) => !shownSet.has(name))
      .map((name) => ({ name, enabled: false })),
  ];

  return [
    {
      card: {
        display: "table",
        dataset_query: jsQuery,
        visualization_settings: {
          "table.columns": tableColumns,
        },
      },
      data: { ...data.data, cols: renamedCols },
    },
  ];
}

/**
 * Row-level events table for the Events tab. Renders nothing until the audit metadata is
 * loaded, then delegates to the inner component.
 */
export function McpEventsTable({
  provider,
  table,
  groupMembersTable,
  ...filters
}: Props) {
  if (!provider || !table || !groupMembersTable) {
    return null;
  }
  return (
    <McpEventsTableInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      {...filters}
    />
  );
}

/**
 * Loaded variant of {@link McpEventsTable}: builds the row-level events query, runs it, and
 * renders the latest tool calls as a table through the shared chart card.
 */
function McpEventsTableInner({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  hasTenants,
  hasPii,
}: InnerProps) {
  const query = useMemo(
    () =>
      buildEventsQuery({
        provider,
        table,
        groupMembersTable,
        dateFilter,
        userId,
        groupId,
        tenantId,
        limit: EVENTS_LIMIT,
      }),
    [provider, table, groupMembersTable, dateFilter, userId, groupId, tenantId],
  );

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);

  const rawSeries = useMemo(
    () => buildEventsRawSeries(data, jsQuery, hasTenants, hasPii),
    [data, jsQuery, hasTenants, hasPii],
  );

  return (
    <BreakoutChartCard
      rawSeries={rawSeries}
      isFetching={isFetching}
      display="table"
      h={TABLE_HEIGHT}
      otherLabel={t`Other`}
    />
  );
}
