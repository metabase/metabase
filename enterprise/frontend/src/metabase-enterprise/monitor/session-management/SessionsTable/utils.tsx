import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import type { TreeTableColumnDef } from "metabase/ui";
import { Badge, Ellipsified, Flex } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { Session } from "metabase-types/api";

import {
  getEndReasonLabel,
  getProviderLabel,
  getSessionTypeLabel,
  getSessionUserName,
} from "../utils";

const ACTIVE_COLUMN_WIDTHS = [0.34, 0.3, 0.16, 0.2];
const ENDED_COLUMN_WIDTHS = [0.26, 0.22, 0.17, 0.18, 0.17];

const DateCell = ({ value }: { value: string }) => (
  <Ellipsified>
    <DateTime value={value} unit="minute" />
  </Ellipsified>
);

const getUserColumn = (): TreeTableColumnDef<Session> => ({
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
});

const getDeviceColumn = (): TreeTableColumnDef<Session> => ({
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
});

const getProviderColumn = (): TreeTableColumnDef<Session> => ({
  id: "provider",
  header: t`Auth method`,
  width: 140,
  enableSorting: true,
  accessorFn: (session) => getProviderLabel(session.provider),
  cell: ({ row }) => getProviderLabel(row.original.provider),
});

const getSignedInColumn = (): TreeTableColumnDef<Session> => ({
  id: "created_at",
  header: t`Signed in`,
  width: 170,
  enableSorting: true,
  sortDescFirst: true,
  accessorFn: (session) => session.created_at,
  cell: ({ row }) => <DateCell value={row.original.created_at} />,
});

const getEndedColumn = (): TreeTableColumnDef<Session> => ({
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
});

const getEndReasonColumn = (): TreeTableColumnDef<Session> => ({
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
});

export const getColumns = (
  isEndedTab: boolean,
): TreeTableColumnDef<Session>[] =>
  isEndedTab
    ? [
        getUserColumn(),
        getDeviceColumn(),
        getSignedInColumn(),
        getEndedColumn(),
        getEndReasonColumn(),
      ]
    : [
        getUserColumn(),
        getDeviceColumn(),
        getProviderColumn(),
        getSignedInColumn(),
      ];

export const getColumnWidths = (isEndedTab: boolean): number[] =>
  isEndedTab ? ENDED_COLUMN_WIDTHS : ACTIVE_COLUMN_WIDTHS;
