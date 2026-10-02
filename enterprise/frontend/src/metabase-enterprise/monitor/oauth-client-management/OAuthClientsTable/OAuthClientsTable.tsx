import type {
  OnChangeFn,
  Row,
  RowSelectionState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
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
import type { OAuthClient } from "metabase-types/api";

import type { OAuthClientRow } from "./types";
import { getColumnWidths, getColumns } from "./utils";

type OAuthClientsTableProps = {
  clients: OAuthClient[] | undefined;
  error: unknown;
  isFetching: boolean;
  isRevokedTab: boolean;
  page: number;
  rowSelection: RowSelectionState;
  sorting: SortingState;
  emptyLabel: string;
  onSortingChange: (sorting: SortingState) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
};

const NO_CLIENTS: OAuthClientRow[] = [];

const toRow = (client: OAuthClient): OAuthClientRow => ({
  ...client,
  id: client.client_id,
});

const getNodeId = (row: OAuthClientRow) => row.id;

// Only an active client has anything left to revoke, and revoking the client the caller is acting through would cut
// them off mid-request — `exclude-current` holds it back server-side for the same reason
const canSelectClient = (row: Row<OAuthClientRow>) =>
  !row.original.current && row.original.status === "active";

export const OAuthClientsTable = ({
  clients,
  error,
  isFetching,
  isRevokedTab,
  page,
  rowSelection,
  sorting,
  emptyLabel,
  onSortingChange,
  onRowSelectionChange,
}: OAuthClientsTableProps) => {
  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    [sorting, onSortingChange],
  );

  const columns = useMemo(() => getColumns(isRevokedTab), [isRevokedTab]);

  const rows = useMemo(() => clients?.map(toRow), [clients]);

  const instance = useTreeTableInstance<OAuthClientRow>({
    data: rows ?? NO_CLIENTS,
    columns,
    getNodeId,
    sorting,
    manualSorting: true,
    enableRowSelection: canSelectClient,
    rowSelection,
    onRowSelectionChange,
    onSortingChange: handleSortingChange,
  });

  useScrollToTop({
    ref: instance.containerRef,
    keys: [page, sorting],
    skip: isFetching,
  });

  const getRowProps = useCallback(
    (row: Row<OAuthClientRow>) => ({
      "data-testid": `oauth-client-row-${row.original.client_id}`,
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
        data-testid="oauth-clients-table"
      >
        <LoadingAndErrorWrapper error={error} />
      </Card>
    );
  }

  const showCheckboxes = !isRevokedTab;

  return (
    <MonitorTableCard aria-busy={isFetching} data-testid="oauth-clients-table">
      {rows === undefined ? (
        <TreeTableSkeleton
          showCheckboxes={showCheckboxes}
          columnWidths={getColumnWidths(isRevokedTab)}
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
            ariaLabel={t`OAuth clients`}
            getRowProps={getRowProps}
            emptyState={<MonitorEmptyState label={emptyLabel} />}
          />
        </>
      )}
    </MonitorTableCard>
  );
};
