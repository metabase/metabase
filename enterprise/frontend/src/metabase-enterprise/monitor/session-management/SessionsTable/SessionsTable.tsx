import type {
  OnChangeFn,
  Row,
  RowSelectionState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useScrollToTop } from "metabase/common/hooks";
import { MonitorEmptyState } from "metabase/monitor/components/MonitorEmptyState";
import { MonitorTableCard } from "metabase/monitor/components/MonitorTableCard";
import {
  Card,
  LoadingOverlay,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type { Session, SessionId } from "metabase-types/api";

import { getColumnWidths, getColumns } from "./utils";

type SessionsTableProps = {
  sessions: Session[] | undefined;
  error: unknown;
  isFetching: boolean;
  isEndedTab: boolean;
  page: number;
  rowSelection: RowSelectionState;
  selectedSessionId: SessionId | undefined;
  sorting: SortingState;
  emptyLabel: string;
  onSortingChange: (sorting: SortingState) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  onRowClick: (sessionId: SessionId) => void;
};

const NO_SESSIONS: Session[] = [];

const getNodeId = (session: Session) => session.id;

// Revoking the caller's own session is done by logging out, not from this page, and the endpoint only ever ends
// live ones — an ended session has nothing left to revoke
const canSelectSession = (row: Row<Session>) =>
  !row.original.current && row.original.status === "live";

export const SessionsTable = ({
  sessions,
  error,
  isFetching,
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

  const columns = useMemo(() => getColumns(isEndedTab), [isEndedTab]);

  const handleRowActivate = useCallback(
    (row: Row<Session>) => {
      onRowClick(row.original.id);
    },
    [onRowClick],
  );

  const instance = useTreeTableInstance<Session>({
    data: sessions ?? NO_SESSIONS,
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
    (row: Row<Session>) => ({
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
      {sessions === undefined ? (
        <TreeTableSkeleton
          showCheckboxes={showCheckboxes}
          columnWidths={getColumnWidths(isEndedTab)}
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
