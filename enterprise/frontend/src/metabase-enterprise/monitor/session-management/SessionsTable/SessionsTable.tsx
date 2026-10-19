import type {
  OnChangeFn,
  Row,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { t } from "ttag";

import { MonitorEntityTable } from "metabase/monitor/components/MonitorEntityTable";
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

// Revoking the caller's own session is done by logging out, not from this page, and the endpoint only ever ends
// live ones — an ended session has nothing left to revoke
const canSelectSession = (row: Row<Session>) =>
  !row.original.current && row.original.status === "live";

const getRowTestId = (session: Session) => `session-row-${session.id}`;

export const SessionsTable = ({
  sessions,
  isEndedTab,
  selectedSessionId,
  ...tableProps
}: SessionsTableProps) => {
  const columns = useMemo(() => getColumns(isEndedTab), [isEndedTab]);

  return (
    <MonitorEntityTable
      {...tableProps}
      rows={sessions}
      columns={columns}
      skeletonColumnWidths={getColumnWidths(isEndedTab)}
      showCheckboxes={!isEndedTab}
      canSelectRow={canSelectSession}
      selectedRowId={selectedSessionId}
      ariaLabel={t`Sessions`}
      getRowTestId={getRowTestId}
      data-testid="sessions-table"
    />
  );
};
