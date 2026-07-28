import { t } from "ttag";

import { parseTimestampWithTimezone } from "metabase/transforms/utils";
import type { TreeTableColumnDef } from "metabase/ui";
import { Ellipsified, Flex, Group, Icon, Tooltip } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { TableIndexEntry } from "metabase-types/api";

import { IndexRowMenu } from "./IndexRowMenu";
import type { IndexRow } from "./types";
import { formatStatus, getIndexName, isPendingStatus } from "./utils";

const ACTIONS_COLUMN_WIDTH = 56;

type Actions = {
  onEdit: (index: TableIndexEntry) => void;
  onDelete: (index: TableIndexEntry) => void;
};

type ColumnsProps = {
  systemTimezone: string | undefined;
  kindLabels: Map<string, string>;
  actions: Actions | undefined;
};

export function getColumns({
  systemTimezone,
  kindLabels,
  actions,
}: ColumnsProps): TreeTableColumnDef<IndexRow>[] {
  const columns: TreeTableColumnDef<IndexRow>[] = [
    {
      id: "name",
      header: t`Name`,
      minWidth: "auto",
      maxAutoWidth: 240,
      enableSorting: true,
      accessorFn: (index) => getIndexName(index),
      cell: ({ getValue }) => (
        <Group gap="sm" wrap="nowrap">
          <Icon name="table_index" c="brand" />
          <Ellipsified>{String(getValue())}</Ellipsified>
        </Group>
      ),
    },
    {
      id: "type",
      header: t`Type`,
      width: "auto",
      enableSorting: true,
      accessorFn: (index) => kindLabels.get(index.kind) ?? index.kind,
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
    {
      id: "columns",
      header: t`Columns`,
      width: "auto",
      maxAutoWidth: 240,
      enableSorting: true,
      accessorFn: (index) => index.key_columns.join(", "),
      cell: ({ getValue }) => {
        const value = String(getValue());
        return value.length > 0 ? (
          <Ellipsified>{value}</Ellipsified>
        ) : (
          EMPTY_CELL_PLACEHOLDER
        );
      },
    },
    {
      id: "source",
      header: t`Source`,
      width: "auto",
      enableSorting: true,
      accessorFn: (index) =>
        index.metabase_managed ? t`Managed` : t`Unmanaged`,
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
    {
      id: "status",
      header: t`Status`,
      width: "auto",
      enableSorting: true,
      accessorFn: (index) => formatStatus(index.request?.status),
      cell: ({ row, getValue }) => {
        const request = row.original.request;
        const errorMessage = request?.error_message;
        return (
          <Group gap="sm" wrap="nowrap">
            <Ellipsified>{String(getValue())}</Ellipsified>
            {errorMessage != null && (
              <Tooltip label={errorMessage}>
                <Icon name="info_outline" c="text-secondary" />
              </Tooltip>
            )}
            {isPendingStatus(request?.status) && (
              <Tooltip
                label={t`Changes will be applied the next time the transform runs`}
              >
                <Icon name="info_outline" c="text-secondary" />
              </Tooltip>
            )}
          </Group>
        );
      },
    },
    {
      id: "modified-by",
      header: t`Last modified by`,
      width: "auto",
      maxAutoWidth: 200,
      enableSorting: true,
      accessorFn: (index) => index.modifiedBy,
      cell: ({ getValue }) => {
        const value = String(getValue());
        return value.length > 0 ? (
          <Ellipsified>{value}</Ellipsified>
        ) : (
          EMPTY_CELL_PLACEHOLDER
        );
      },
    },
    {
      id: "last-run",
      header: t`Last run`,
      width: "auto",
      enableSorting: true,
      accessorFn: (index) => index.request?.last_executed_at ?? null,
      cell: ({ getValue }) => {
        const lastExecutedAt = getValue<string | null>();
        if (lastExecutedAt == null) {
          return t`Never`;
        }
        return (
          <Ellipsified>
            {parseTimestampWithTimezone(lastExecutedAt, systemTimezone).format(
              "lll",
            )}
          </Ellipsified>
        );
      },
    },
  ];

  if (actions != null) {
    columns.push({
      id: "actions",
      header: "",
      width: ACTIONS_COLUMN_WIDTH,
      enableSorting: false,
      cell: ({ row }) => (
        <Flex justify="center">
          <IndexRowMenu
            index={row.original}
            onEdit={actions.onEdit}
            onDelete={actions.onDelete}
          />
        </Flex>
      ),
    });
  }

  return columns;
}
