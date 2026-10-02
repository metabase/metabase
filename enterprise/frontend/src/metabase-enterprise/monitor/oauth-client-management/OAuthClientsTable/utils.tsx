import { t } from "ttag";

import { MonitorDateCell } from "metabase/monitor/components/MonitorDateCell";
import type { TreeTableColumnDef } from "metabase/ui";
import { Badge, Ellipsified, Flex, Stack, Text } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";

import { getOAuthClientName, getRevokerName } from "../utils";

import type { OAuthClientRow } from "./types";

const ACTIVE_COLUMN_WIDTHS = [0.28, 0.22, 0.1, 0.1, 0.15, 0.15];
const REVOKED_COLUMN_WIDTHS = [0.28, 0.24, 0.16, 0.16, 0.16];

const getClientColumn = (): TreeTableColumnDef<OAuthClientRow> => ({
  id: "client_name",
  header: t`Client`,
  minWidth: 220,
  enableSorting: true,
  // a name sorts A-Z on the first click; only the dates and counts below read better largest-first
  sortDescFirst: false,
  accessorFn: (client) => getOAuthClientName(client),
  cell: ({ row }) => {
    const name = getOAuthClientName(row.original);
    return (
      <Stack gap={0} miw={0}>
        <Flex gap="sm" align="center" miw={0}>
          <Ellipsified tooltip={name} alwaysShowTooltip>
            {name}
          </Ellipsified>
          {row.original.current && (
            <Badge variant="light" color="brand" size="xs" flex="0 0 auto">
              {t`This client`}
            </Badge>
          )}
        </Flex>
        {/* `fz`, not `size`: Ellipsified forwards text props over its own `fz="inherit"` */}
        <Ellipsified
          tooltip={row.original.client_id}
          fz="sm"
          c="text-secondary"
          lh="1rem"
        >
          {row.original.client_id}
        </Ellipsified>
      </Stack>
    );
  },
});

const getRedirectUrisColumn = (): TreeTableColumnDef<OAuthClientRow> => ({
  id: "redirect_uris",
  header: t`Redirect URIs`,
  minWidth: 180,
  enableSorting: false,
  accessorFn: (client) => client.redirect_uris.join(", "),
  cell: ({ row }) => {
    const uris = row.original.redirect_uris.join(", ");
    return (
      <Ellipsified tooltip={uris}>{uris || EMPTY_CELL_PLACEHOLDER}</Ellipsified>
    );
  },
});

const getUsersColumn = (): TreeTableColumnDef<OAuthClientRow> => ({
  id: "user_count",
  header: t`Users`,
  width: 100,
  enableSorting: true,
  sortDescFirst: true,
  accessorFn: (client) => client.user_count,
  cell: ({ row }) => row.original.user_count,
});

const getLiveTokensColumn = (): TreeTableColumnDef<OAuthClientRow> => ({
  id: "live_tokens",
  header: t`Live tokens`,
  width: 120,
  enableSorting: true,
  sortDescFirst: true,
  accessorFn: (client) => client.live_tokens,
  cell: ({ row }) => row.original.live_tokens,
});

const getLastUsedColumn = (): TreeTableColumnDef<OAuthClientRow> => ({
  id: "last_used_at",
  header: t`Last used`,
  width: 170,
  enableSorting: true,
  sortDescFirst: true,
  // the endpoint sorts a never-used client by its registration, so the accessor is only ever read by the cell
  accessorFn: (client) => client.last_used_at ?? "",
  cell: ({ row }) =>
    row.original.last_used_at ? (
      <MonitorDateCell value={row.original.last_used_at} />
    ) : (
      // the secondary text the `client_id` line in the Client column uses, so a client that has never been used
      // reads as a note rather than as a value
      <Text size="sm" c="text-secondary" lh="1rem">
        {t`Never used`}
      </Text>
    ),
});

const getRegisteredColumn = (): TreeTableColumnDef<OAuthClientRow> => ({
  id: "created_at",
  header: t`Registered`,
  width: 170,
  enableSorting: true,
  sortDescFirst: true,
  accessorFn: (client) => client.created_at,
  cell: ({ row }) => <MonitorDateCell value={row.original.created_at} />,
});

const getRevokedColumn = (): TreeTableColumnDef<OAuthClientRow> => ({
  id: "revoked_at",
  header: t`Revoked`,
  width: 170,
  enableSorting: true,
  sortDescFirst: true,
  accessorFn: (client) => client.revoked_at ?? "",
  cell: ({ row }) =>
    row.original.revoked_at ? (
      <MonitorDateCell value={row.original.revoked_at} />
    ) : (
      EMPTY_CELL_PLACEHOLDER
    ),
});

const getRevokedByColumn = (): TreeTableColumnDef<OAuthClientRow> => ({
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
});

// Users and Live tokens count only unrevoked tokens, so they read 0 for every revoked client, and a revoked
// client's tokens stop resolving so its last use can never move again; the Revoked tab spends their width on who
// revoked it and when instead.
export const getColumns = (
  isRevokedTab: boolean,
): TreeTableColumnDef<OAuthClientRow>[] =>
  isRevokedTab
    ? [
        getClientColumn(),
        getRedirectUrisColumn(),
        getRegisteredColumn(),
        getRevokedColumn(),
        getRevokedByColumn(),
      ]
    : [
        getClientColumn(),
        getRedirectUrisColumn(),
        getUsersColumn(),
        getLiveTokensColumn(),
        getLastUsedColumn(),
        getRegisteredColumn(),
      ];

export const getColumnWidths = (isRevokedTab: boolean): number[] =>
  isRevokedTab ? REVOKED_COLUMN_WIDTHS : ACTIVE_COLUMN_WIDTHS;
