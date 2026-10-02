import type { OnChangeFn, Row, RowSelectionState } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useScrollToTop } from "metabase/common/hooks";
import { MonitorDateCell } from "metabase/monitor/components/MonitorDateCell";
import { MonitorEmptyState } from "metabase/monitor/components/MonitorEmptyState";
import { MonitorTableCard } from "metabase/monitor/components/MonitorTableCard";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Card,
  Ellipsified,
  LoadingOverlay,
  Stack,
  Text,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { OAuthClient, OAuthClientId } from "metabase-types/api";

import { getOAuthClientName, getRevokerName } from "../utils";

type OAuthClientsTableProps = {
  clients: OAuthClient[];
  error: unknown;
  isFetching: boolean;
  isLoading: boolean;
  isRevokedTab: boolean;
  page: number;
  rowSelection: RowSelectionState;
  emptyLabel: string;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
};

/** `TreeNodeData` requires an `id`, which the list response does not carry: a client's identity is its `client_id`. */
type OAuthClientRow = OAuthClient & { id: OAuthClientId };

const toRow = (client: OAuthClient): OAuthClientRow => ({
  ...client,
  id: client.client_id,
});

const getNodeId = (row: OAuthClientRow) => row.id;

// Only an active client has anything left to revoke, and revoking the client the caller is acting through would cut
// them off mid-request — `exclude-current` holds it back server-side for the same reason
const canSelectClient = (row: Row<OAuthClientRow>) =>
  !row.original.current && row.original.status === "active";

const ACTIVE_COLUMN_WIDTHS = [0.32, 0.28, 0.12, 0.12, 0.16];
const REVOKED_COLUMN_WIDTHS = [0.28, 0.24, 0.16, 0.16, 0.16];

export const OAuthClientsTable = ({
  clients,
  error,
  isFetching,
  isLoading,
  isRevokedTab,
  page,
  rowSelection,
  emptyLabel,
  onRowSelectionChange,
}: OAuthClientsTableProps) => {
  const columns = useMemo<TreeTableColumnDef<OAuthClientRow>[]>(() => {
    const clientColumn: TreeTableColumnDef<OAuthClientRow> = {
      id: "client_name",
      header: t`Client`,
      minWidth: 220,
      enableSorting: false,
      accessorFn: (client) => getOAuthClientName(client),
      cell: ({ row }) => (
        <Stack gap={0} miw={0}>
          <Ellipsified>{getOAuthClientName(row.original)}</Ellipsified>
          <Text size="sm" c="text-secondary" lh="1rem" truncate>
            {row.original.client_id}
          </Text>
        </Stack>
      ),
    };

    const redirectUrisColumn: TreeTableColumnDef<OAuthClientRow> = {
      id: "redirect_uris",
      header: t`Redirect URIs`,
      minWidth: 180,
      enableSorting: false,
      accessorFn: (client) => client.redirect_uris.join(", "),
      cell: ({ row }) => {
        const uris = row.original.redirect_uris.join(", ");
        return (
          <Ellipsified tooltip={uris}>
            {uris || EMPTY_CELL_PLACEHOLDER}
          </Ellipsified>
        );
      },
    };

    const registeredColumn: TreeTableColumnDef<OAuthClientRow> = {
      id: "created_at",
      header: t`Registered`,
      width: 170,
      // the endpoint sorts by registration already, and this slice offers no sort control
      enableSorting: false,
      accessorFn: (client) => client.created_at,
      cell: ({ row }) => <MonitorDateCell value={row.original.created_at} />,
    };

    if (isRevokedTab) {
      // Users and Live tokens count only unrevoked tokens, so they read 0 for every revoked client; this tab
      // spends their width on who revoked it and when instead.
      return [
        clientColumn,
        redirectUrisColumn,
        registeredColumn,
        {
          id: "revoked_at",
          header: t`Revoked`,
          width: 170,
          enableSorting: false,
          accessorFn: (client) => client.revoked_at ?? "",
          cell: ({ row }) =>
            row.original.revoked_at ? (
              <MonitorDateCell value={row.original.revoked_at} />
            ) : (
              EMPTY_CELL_PLACEHOLDER
            ),
        },
        {
          id: "revoked_by",
          header: t`Revoked by`,
          minWidth: 160,
          enableSorting: false,
          accessorFn: (client) => getRevokerName(client) ?? "",
          cell: ({ row }) => (
            <Ellipsified tooltip={row.original.revoked_by?.email}>
              {getRevokerName(row.original) ?? EMPTY_CELL_PLACEHOLDER}
            </Ellipsified>
          ),
        },
      ];
    }

    return [
      clientColumn,
      redirectUrisColumn,
      {
        id: "user_count",
        header: t`Users`,
        width: 100,
        enableSorting: false,
        accessorFn: (client) => client.user_count,
        cell: ({ row }) => row.original.user_count,
      },
      {
        id: "live_tokens",
        header: t`Live tokens`,
        width: 120,
        enableSorting: false,
        accessorFn: (client) => client.live_tokens,
        cell: ({ row }) => row.original.live_tokens,
      },
      registeredColumn,
    ];
  }, [isRevokedTab]);

  const rows = useMemo(() => clients.map(toRow), [clients]);

  const instance = useTreeTableInstance<OAuthClientRow>({
    data: rows,
    columns,
    getNodeId,
    enableRowSelection: canSelectClient,
    rowSelection,
    onRowSelectionChange,
  });

  useScrollToTop({
    ref: instance.containerRef,
    keys: [page],
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
      {isLoading ? (
        <TreeTableSkeleton
          showCheckboxes={showCheckboxes}
          columnWidths={
            isRevokedTab ? REVOKED_COLUMN_WIDTHS : ACTIVE_COLUMN_WIDTHS
          }
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
