import type {
  OnChangeFn,
  Row,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { t } from "ttag";

import { MonitorEntityTable } from "metabase/monitor/components/MonitorEntityTable";
import type { OAuthClient, OAuthClientId } from "metabase-types/api";

import type { OAuthClientRow } from "./types";
import { getColumnWidths, getColumns } from "./utils";

type OAuthClientsTableProps = {
  clients: OAuthClient[] | undefined;
  error: unknown;
  isFetching: boolean;
  isRevokedTab: boolean;
  page: number;
  rowSelection: RowSelectionState;
  selectedClientId: OAuthClientId | undefined;
  sorting: SortingState;
  emptyLabel: string;
  onSortingChange: (sorting: SortingState) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  onRowClick: (clientId: OAuthClientId) => void;
};

const toRow = (client: OAuthClient): OAuthClientRow => ({
  ...client,
  id: client.client_id,
});

const canSelectClient = (row: Row<OAuthClientRow>) =>
  row.original.status === "active";

const getRowTestId = (row: OAuthClientRow) => `oauth-client-row-${row.id}`;

export const OAuthClientsTable = ({
  clients,
  isRevokedTab,
  selectedClientId,
  ...tableProps
}: OAuthClientsTableProps) => {
  const columns = useMemo(() => getColumns(isRevokedTab), [isRevokedTab]);
  const rows = useMemo(() => clients?.map(toRow), [clients]);

  return (
    <MonitorEntityTable
      {...tableProps}
      rows={rows}
      columns={columns}
      skeletonColumnWidths={getColumnWidths(isRevokedTab)}
      showCheckboxes={!isRevokedTab}
      canSelectRow={canSelectClient}
      selectedRowId={selectedClientId}
      ariaLabel={t`OAuth clients`}
      getRowTestId={getRowTestId}
      data-testid="oauth-clients-table"
    />
  );
};
