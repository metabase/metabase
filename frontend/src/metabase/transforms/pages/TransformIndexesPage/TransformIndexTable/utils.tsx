import { t } from "ttag";

import { parseTimestampWithTimezone } from "metabase/transforms/utils";
import type { TreeTableColumnDef } from "metabase/ui";
import { Ellipsified, Group, Icon, Tooltip } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type {
  TableIndexEntry,
  TableIndexRequestStatus,
} from "metabase-types/api";

import type { IndexRow } from "./types";

export function getIndexName(index: TableIndexEntry): string {
  return index.name ?? index.kind;
}

export function getIndexKey(index: TableIndexEntry, position: number): string {
  if (index.request?.id !== undefined) {
    return `request-${index.request.id}`;
  }

  return `index-${getIndexName(index)}-${position}`;
}

function formatStatus(status: TableIndexRequestStatus | undefined): string {
  switch (status) {
    case "pending":
      return t`Pending`;
    case "running":
      return t`Running`;
    case "succeeded":
      return t`Succeeded`;
    case "failed":
      return t`Failed`;
    case "dropped":
      return t`Dropped`;
    default:
      return EMPTY_CELL_PLACEHOLDER;
  }
}

export function getColumns(
  systemTimezone: string | undefined,
): TreeTableColumnDef<IndexRow>[] {
  return [
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
      accessorFn: (index) => index.kind,
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
        const errorMessage = row.original.request?.error_message;
        return (
          <Group gap="sm" wrap="nowrap">
            <Ellipsified>{String(getValue())}</Ellipsified>
            {errorMessage != null && (
              <Tooltip label={errorMessage}>
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
}
