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
  Text,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { ApiKey } from "metabase-types/api";

const getNodeId = (apiKey: ApiKey) => String(apiKey.id);

type ApiKeyLivenessRow = ApiKey;

type Props = {
  title: string;
  h?: number;
};

const TABLE_HEIGHT = 500;

/**
 * Per-key liveness table: name, group, and `last_used_at` for every API key, sorted by most
 * recently used first, so an admin can spot which keys are still active and which have gone
 * quiet. `last_used_at` is a throttled timestamp on the `api_key` table itself (not in
 * `v_api_key_usage`, which only covers request logs), so this queries the regular
 * `/api/api-key` list endpoint rather than the audit database.
 */
export function ApiKeyLivenessTable({ title, h = TABLE_HEIGHT }: Props) {
  const { data: apiKeys, isLoading, error } = useListApiKeysQuery();

  const sortedApiKeys = useMemo(() => {
    if (!apiKeys) {
      return [];
    }
    return [...apiKeys].sort((a, b) => {
      if (!a.last_used_at) {
        return b.last_used_at ? 1 : 0;
      }
      if (!b.last_used_at) {
        return -1;
      }
      return b.last_used_at.localeCompare(a.last_used_at);
    });
  }, [apiKeys]);

  const columns = useMemo<TreeTableColumnDef<ApiKeyLivenessRow>[]>(
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

  const treeTableInstance = useTreeTableInstance<ApiKeyLivenessRow>({
    data: sortedApiKeys,
    columns,
    getNodeId,
  });

  return (
    <Card withBorder shadow="none" px="xl" pt="lg" pb="lg" h={h}>
      <Text fw="bold" mb="lg">
        {title}
      </Text>
      <Box
        h="calc(100% - 2rem)"
        style={{ overflow: "auto" }}
        data-testid="api-key-liveness-table"
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
            emptyState={<MonitorEmptyState label={t`No API keys found`} />}
          />
        )}
      </Box>
    </Card>
  );
}
