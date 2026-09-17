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
  getEndReasonLabel,
  getProviderLabel,
  getSessionTypeLabel,
  getSessionUserName,
} from "../utils";

type SessionsTableProps = {
  sessions: AdminSession[];
  error: unknown;
  isFetching: boolean;
  isLoading: boolean;
  isEndedTab: boolean;
  page: number;
  rowSelection: RowSelectionState;
  selectedSessionId: AdminSessionId | undefined;
  sorting: SortingState;
  emptyLabel: string;
  onSortingChange: (sorting: SortingState) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  onRowClick: (sessionId: AdminSessionId) => void;
};

const getNodeId = (session: AdminSession) => session.id;

// Revoking the caller's own session is done by logging out, not from this page, and the endpoint only ever ends
// live ones — an ended session has nothing left to revoke
const canSelectSession = (row: Row<AdminSession>) =>
  !row.original.current && row.original.status === "live";

const ACTIVE_COLUMN_WIDTHS = [0.34, 0.3, 0.16, 0.2];
const ENDED_COLUMN_WIDTHS = [0.26, 0.22, 0.17, 0.18, 0.17];

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
  isEndedTab,
  page,
  rowSelection,
  selectedSessionId,
  sorting,
  emptyLabel,
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

  const columns = useMemo<TreeTableColumnDef<AdminSession>[]>(() => {
    const userColumn: TreeTableColumnDef<AdminSession> = {
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
    };

    const deviceColumn: TreeTableColumnDef<AdminSession> = {
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
    };

    const signedInColumn: TreeTableColumnDef<AdminSession> = {
      id: "created_at",
      header: t`Signed in`,
      width: 170,
      enableSorting: true,
      sortDescFirst: true,
      accessorFn: (session) => session.created_at,
      cell: ({ row }) => <DateCell value={row.original.created_at} />,
    };

    if (isEndedTab) {
      return [
        userColumn,
        deviceColumn,
        signedInColumn,
        {
          id: "ended_at",
          header: t`Ended`,
          width: 170,
          // `ended_at` is not an offered sort column, so don't show a header that cannot round-trip
          enableSorting: false,
          accessorFn: (session) => session.ended_at ?? "",
          cell: ({ row }) =>
            row.original.ended_at ? (
              <DateCell value={row.original.ended_at} />
            ) : (
              EMPTY_CELL_PLACEHOLDER
            ),
        },
        {
          id: "end_reason",
          header: t`Reason`,
          width: 150,
          enableSorting: false,
          accessorFn: (session) => session.end_reason ?? "",
          cell: ({ row }) => (
            <Ellipsified>
              {row.original.end_reason
                ? getEndReasonLabel(row.original.end_reason)
                : EMPTY_CELL_PLACEHOLDER}
            </Ellipsified>
          ),
        },
      ];
    }

    return [
      userColumn,
      deviceColumn,
      {
        id: "provider",
        header: t`Auth method`,
        width: 140,
        enableSorting: true,
        accessorFn: (session) => getProviderLabel(session.provider),
        cell: ({ row }) => getProviderLabel(row.original.provider),
      },
      signedInColumn,
    ];
  }, [isEndedTab]);

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

  const showCheckboxes = !isEndedTab;

  return (
    <MonitorTableCard aria-busy={isFetching} data-testid="sessions-table">
      {isLoading ? (
        <TreeTableSkeleton
          showCheckboxes={showCheckboxes}
          columnWidths={isEndedTab ? ENDED_COLUMN_WIDTHS : ACTIVE_COLUMN_WIDTHS}
        />
      ) : (
        <>
          <LoadingOverlay visible={isFetching} data-testid="loading-overlay" />
          <TreeTable
            instance={instance}
            hierarchical={false}
            showCheckboxes={showCheckboxes}
            onHeaderCheckboxClick={() => instance.table.toggleAllRowsSelected()}
            headerCheckboxAriaLabel={t`Select all`}
            ariaLabel={t`Sessions`}
            onRowClick={handleRowActivate}
            getRowProps={getRowProps}
            emptyState={<MonitorEmptyState label={emptyLabel} />}
          />
        </>
      )}
    </MonitorTableCard>
  );
};
