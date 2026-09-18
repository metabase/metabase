import { useMemo } from "react";
import { t } from "ttag";

import { useListApiKeysQuery } from "metabase/admin/settings/api/api-key";
import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { MonitorEmptyState } from "metabase/monitor/components/MonitorEmptyState";
import {
  Box,
  Card,
  Ellipsified,
  Flex,
  Skeleton,
  Text,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { useAdhocBreakoutQuery } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAdhocBreakoutQuery";
import type { ApiKeyUsageFilters } from "metabase-enterprise/monitor/api-key-usage/query-utils";
import { buildKeyActivityQuery } from "metabase-enterprise/monitor/api-key-usage/query-utils";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import type { ApiKey } from "metabase-types/api";

const getNodeId = (apiKey: ApiKey) => String(apiKey.id);

type ApiKeyActivityRow = ApiKey;

type DataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
};

type Props = DataSources &
  ApiKeyUsageFilters & {
    title: string;
    h?: number;
  };

type InnerProps = ApiKeyUsageFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  title: string;
  h: number;
};

const TABLE_HEIGHT = 500;

/**
 * Per-key activity table: name, group, and most recent activity for every API key matching the
 * page's date/API key/user/group filters, most recently active first. Key metadata (name, group)
 * comes from `GET /api/api-key`; which keys appear, and their "Last used" timestamp, come from a
 * `MAX(occurred_at)` breakout over the audit view scoped to the same filters as the rest of the
 * page — so a key with no activity in the selected window drops out entirely, rather than always
 * showing every key that has ever existed.
 */
export function ApiKeyActivityTable({
  provider,
  table,
  groupMembersTable,
  h = TABLE_HEIGHT,
  ...filters
}: Props) {
  if (!provider || !table || !groupMembersTable) {
    return <Skeleton h={h} />;
  }
  return (
    <ApiKeyActivityTableInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      h={h}
      {...filters}
    />
  );
}

function ApiKeyActivityTableInner({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  apiKeyId,
  userId,
  groupId,
  title,
  h,
}: InnerProps) {
  const {
    data: apiKeys,
    isLoading: isLoadingKeys,
    error: keysError,
  } = useListApiKeysQuery();

  const activityQuery = useMemo(
    () =>
      buildKeyActivityQuery({
        provider,
        table,
        groupMembersTable,
        dateFilter,
        apiKeyId,
        userId,
        groupId,
      }),
    [provider, table, groupMembersTable, dateFilter, apiKeyId, userId, groupId],
  );
  const {
    data: activityData,
    isFetching: isFetchingActivity,
    error: activityError,
  } = useAdhocBreakoutQuery(activityQuery);

  // Maps each key with activity in the filtered window to the timestamp of its latest call.
  const lastActivityByKeyId = useMemo(() => {
    const cols = activityData?.data?.cols ?? [];
    const rows = activityData?.data?.rows ?? [];
    const keyIdIndex = cols.findIndex(
      (col) => col.name?.toLowerCase() === "api_key_id",
    );
    const lastActivityIndex = cols.findIndex(
      (col) => col.source === "aggregation",
    );
    const entries: [number, string | null][] =
      keyIdIndex < 0 || lastActivityIndex < 0
        ? []
        : rows.map((row) => [
            Number(row[keyIdIndex]),
            row[lastActivityIndex] == null
              ? null
              : String(row[lastActivityIndex]),
          ]);
    return new Map(entries);
  }, [activityData]);

  const rows = useMemo<ApiKeyActivityRow[] | undefined>(
    () =>
      apiKeys
        ?.filter((apiKey) => lastActivityByKeyId.has(apiKey.id))
        .map((apiKey) => ({
          ...apiKey,
          last_used_at: lastActivityByKeyId.get(apiKey.id) ?? null,
        })),
    [apiKeys, lastActivityByKeyId],
  );

  const columns = useMemo<TreeTableColumnDef<ApiKeyActivityRow>[]>(
    () => [
      {
        id: "name",
        header: t`Key name`,
        minWidth: 120,
        accessorFn: (apiKey) => apiKey.name,
        cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
      },
      {
        id: "group",
        header: t`Group`,
        minWidth: 100,
        accessorFn: (apiKey) => apiKey.group?.name,
        cell: ({ row }) => (
          <Ellipsified>{row.original.group?.name}</Ellipsified>
        ),
      },
      {
        id: "last_used_at",
        header: t`Last used`,
        minWidth: 120,
        accessorFn: (apiKey) => apiKey.last_used_at,
        cell: ({ row }) =>
          row.original.last_used_at ? (
            <DateTime value={row.original.last_used_at} />
          ) : (
            EMPTY_CELL_PLACEHOLDER
          ),
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTableInstance<ApiKeyActivityRow>({
    data: rows ?? [],
    columns,
    getNodeId,
  });

  const isLoading = isLoadingKeys || (isFetchingActivity && !activityData);
  const error = keysError ?? activityError;

  return (
    <Card withBorder shadow="none" px="xl" pt="lg" pb="lg" h={h}>
      <Text fw="bold" mb="lg">
        {title}
      </Text>
      <Box
        h="calc(100% - 2rem)"
        style={{ overflow: "auto" }}
        data-testid="api-key-activity-table"
        aria-busy={isLoading}
      >
        {error ? (
          <Flex mih="60%" align="center" justify="center">
            <LoadingAndErrorWrapper loading={false} error={error} />
          </Flex>
        ) : isLoading ? (
          <TreeTableSkeleton
            columnWidths={columns.map(() => 1 / columns.length)}
          />
        ) : (
          <TreeTable
            instance={treeTableInstance}
            hierarchical={false}
            ariaLabel={t`API keys`}
            emptyState={<MonitorEmptyState label={t`No key activity`} />}
          />
        )}
      </Box>
    </Card>
  );
}
