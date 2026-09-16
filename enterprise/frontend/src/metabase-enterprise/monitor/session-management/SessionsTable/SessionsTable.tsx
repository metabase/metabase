import type {
  OnChangeFn,
  Row,
  RowSelectionState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useScrollToTop } from "metabase/common/hooks";
import { MonitorEmptyState } from "metabase/monitor/components/MonitorEmptyState";
import { MonitorTableCard } from "metabase/monitor/components/MonitorTableCard";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Badge,
  Card,
  Ellipsified,
  Flex,
  LoadingOverlay,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { AdminSession, AdminSessionId } from "metabase-types/api";

import {
  getProviderLabel,
  getSessionTypeLabel,
  getSessionUserName,
} from "../utils";

type SessionsTableProps = {
  sessions: AdminSession[];
  error: unknown;
  isFetching: boolean;
  isLoading: boolean;
  page: number;
  rowSelection: RowSelectionState;
  selectedSessionId: AdminSessionId | undefined;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  onRowClick: (sessionId: AdminSessionId) => void;
};

const getNodeId = (session: AdminSession) => session.id;

// Revoking the caller's own session is done by logging out, not from this page
const canSelectSession = (row: Row<AdminSession>) => !row.original.current;

const DateCell = ({ value }: { value: string }) => (
  <Ellipsified>
    <DateTime value={value} unit="minute" />
  </Ellipsified>
);

export const SessionsTable = ({
  sessions,
  error,
  isFetching,
  isLoading,
  page,
  rowSelection,
  selectedSessionId,
  sorting,
  onSortingChange,
  onRowSelectionChange,
  onRowClick,
}: SessionsTableProps) => {
  const selectedRowId = selectedSessionId ?? null;

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    [sorting, onSortingChange],
  );

  const columns = useMemo<TreeTableColumnDef<AdminSession>[]>(
    () => [
      {
        id: "user_email",
        header: t`User`,
        minWidth: 200,
        enableSorting: true,
        accessorFn: (session) => session.user.email,
        cell: ({ row }) => (
          <Flex gap="sm" align="center" miw={0}>
            <Ellipsified tooltip={row.original.user.email} alwaysShowTooltip>
              {getSessionUserName(row.original.user)}
            </Ellipsified>
            {row.original.current && (
              <Badge variant="light" color="brand" size="xs" flex="0 0 auto">
                {t`This session`}
              </Badge>
            )}
          </Flex>
        ),
      },
      {
        id: "device",
        header: t`Device`,
        minWidth: 180,
        enableSorting: false,
        accessorFn: (session) => session.device_description ?? "",
        cell: ({ row }) => (
          <Flex gap="sm" align="center" miw={0}>
            <Ellipsified tooltip={row.original.user_agent}>
              {row.original.device_description ?? EMPTY_CELL_PLACEHOLDER}
            </Ellipsified>
            {row.original.type === "full-app-embed" && (
              <Badge variant="light" size="xs" flex="0 0 auto">
                {getSessionTypeLabel(row.original.type)}
              </Badge>
            )}
          </Flex>
        ),
      },
      {
        id: "ip_address",
        header: t`IP address`,
        width: 140,
        enableSorting: false,
        accessorFn: (session) => session.ip_address ?? "",
        cell: ({ row }) => row.original.ip_address ?? EMPTY_CELL_PLACEHOLDER,
      },
      {
        id: "provider",
        header: t`Auth method`,
        width: 140,
        enableSorting: true,
        accessorFn: (session) => getProviderLabel(session.provider),
        cell: ({ row }) => getProviderLabel(row.original.provider),
      },
      {
        id: "created_at",
        header: t`Signed in`,
        width: 170,
        enableSorting: true,
        sortDescFirst: true,
        accessorFn: (session) => session.created_at,
        cell: ({ row }) => <DateCell value={row.original.created_at} />,
      },
      {
        id: "last_active_at",
        header: t`Last active`,
        width: 170,
        enableSorting: true,
        sortDescFirst: true,
        accessorFn: (session) => session.last_active_at ?? "",
        cell: ({ row }) =>
          row.original.last_active_at ? (
            <DateCell value={row.original.last_active_at} />
          ) : (
            EMPTY_CELL_PLACEHOLDER
          ),
      },
      {
        id: "expires_at",
        header: t`Expires`,
        width: 170,
        enableSorting: false,
        accessorFn: (session) => session.expires_at,
        cell: ({ row }) => <DateCell value={row.original.expires_at} />,
      },
    ],
    [],
  );

  const handleRowActivate = useCallback(
    (row: Row<AdminSession>) => {
      onRowClick(row.original.id);
    },
    [onRowClick],
  );

  const instance = useTreeTableInstance<AdminSession>({
    data: sessions,
    columns,
    getNodeId,
    sorting,
    manualSorting: true,
    enableRowSelection: canSelectSession,
    rowSelection,
    onRowSelectionChange,
    onRowActivate: handleRowActivate,
    onSortingChange: handleSortingChange,
    selectedRowId,
  });

  const { setActiveRowId } = instance;
  useEffect(() => {
    setActiveRowId(selectedRowId);
  }, [selectedRowId, setActiveRowId]);

  useScrollToTop({
    ref: instance.containerRef,
    keys: [page, sorting],
    skip: isFetching,
  });

  const getRowProps = useCallback(
    (row: Row<AdminSession>) => ({
      "data-testid": `session-row-${row.original.id}`,
    }),
    [],
  );

  if (error !== undefined) {
    return (
      <Card
        flex="0 1 auto"
        mih={0}
        withBorder
        p="xl"
        data-testid="sessions-table"
      >
        <LoadingAndErrorWrapper error={error} />
      </Card>
    );
  }

  return (
    <MonitorTableCard aria-busy={isFetching} data-testid="sessions-table">
      {isLoading ? (
        <TreeTableSkeleton
          showCheckboxes
          columnWidths={[0.2, 0.18, 0.1, 0.1, 0.14, 0.14, 0.14]}
        />
      ) : (
        <>
          <LoadingOverlay visible={isFetching} data-testid="loading-overlay" />
          <TreeTable
            instance={instance}
            hierarchical={false}
            showCheckboxes
            onHeaderCheckboxClick={() => instance.table.toggleAllRowsSelected()}
            headerCheckboxAriaLabel={t`Select all`}
            ariaLabel={t`Sessions`}
            onRowClick={handleRowActivate}
            getRowProps={getRowProps}
            emptyState={<MonitorEmptyState label={t`No active sessions`} />}
          />
        </>
      )}
    </MonitorTableCard>
  );
};
