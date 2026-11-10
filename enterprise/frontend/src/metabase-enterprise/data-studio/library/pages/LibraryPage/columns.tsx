import { useMemo } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetCardQuery,
  useListTablesQuery,
  useListUsersQuery,
} from "metabase/api";
import type { TreeItem } from "metabase/data-studio/common/types";
import {
  getTableSubjectIcon,
  getTableSubjectLabel,
  useSemanticTypes,
} from "metabase/metadata/semantic-types";
import { useTableFields } from "metabase/metadata/table-structure";
import {
  Ellipsified,
  Group,
  Icon,
  Text,
  type TreeTableColumnDef,
} from "metabase/ui";
import type { Table, TableId, UserId } from "metabase-types/api";

const NO_COLUMNS: TreeTableColumnDef<TreeItem>[] = [];

/** The id of a table or metric row; folders and placeholders have none */
function getItemId({ data }: TreeItem): number | undefined {
  return "id" in data && typeof data.id === "number" ? data.id : undefined;
}

/**
 * Subject and Owner columns for the published tables list. Collection items
 * don't carry either, so they're read from the published tables.
 */
export function usePublishedTableColumns({
  isEnabled,
}: {
  isEnabled: boolean;
}): {
  columns: TreeTableColumnDef<TreeItem>[];
  trailingColumns: TreeTableColumnDef<TreeItem>[];
} {
  const { data: tables } = useListTablesQuery(
    isEnabled ? { "published-only": true } : skipToken,
  );
  const { data: usersResponse } = useListUsersQuery(
    isEnabled ? undefined : skipToken,
  );

  return useMemo(() => {
    if (!isEnabled) {
      return { columns: NO_COLUMNS, trailingColumns: NO_COLUMNS };
    }
    const tableById = new Map<TableId, Table>(
      (tables ?? []).map((table) => [table.id, table]),
    );
    const userNameById = new Map<UserId, string>(
      (usersResponse?.data ?? []).map((user) => [user.id, user.common_name]),
    );
    const getTable = (item: TreeItem) => {
      const tableId = getItemId(item);
      return item.model === "table" && tableId != null
        ? tableById.get(tableId)
        : undefined;
    };

    return {
      // Subject sits right after the name
      columns: [
        {
          id: "subject",
          header: t`Subject`,
          width: 200,
          cell: ({ row }) => {
            const table = getTable(row.original);
            return table != null ? <TableSubjectCell table={table} /> : null;
          },
        },
      ],
      // Owner sits at the far right
      trailingColumns: [
        {
          id: "owner",
          header: t`Owner`,
          width: 160,
          cell: ({ row }) => {
            const table = getTable(row.original);
            if (table == null) {
              return null;
            }
            const ownerName =
              (table.owner_user_id != null
                ? userNameById.get(table.owner_user_id)
                : undefined) ?? table.owner_email;
            return ownerName ? <Ellipsified>{ownerName}</Ellipsified> : null;
          },
        },
      ],
    };
  }, [isEnabled, tables, usersResponse]);
}

/** PROTOTYPE: mocked. The table's subject, as on its Overview page. */
function TableSubjectCell({ table }: { table: Table }) {
  const fields = useTableFields(table);
  const { getTableSubject } = useSemanticTypes();

  if (fields == null) {
    return null;
  }
  const { subject } = getTableSubject({ ...table, fields });

  return subject != null ? (
    <Group gap="sm" wrap="nowrap" miw={0}>
      <Icon name={getTableSubjectIcon(subject)} c="text-secondary" />
      <Ellipsified>{getTableSubjectLabel(subject)}</Ellipsified>
    </Group>
  ) : (
    <Text c="text-secondary">{t`No subject`}</Text>
  );
}

/**
 * The Owner column for the metrics list. Metrics have no owner field, so
 * PROTOTYPE: the person who created the metric stands in for its owner.
 */
export function useMetricOwnerColumns({
  isEnabled,
}: {
  isEnabled: boolean;
}): TreeTableColumnDef<TreeItem>[] {
  return useMemo(
    () =>
      isEnabled
        ? [
            {
              id: "owner",
              header: t`Owner`,
              width: 160,
              cell: ({ row }) => {
                const cardId = getItemId(row.original);
                return row.original.model === "metric" && cardId != null ? (
                  <MetricOwnerCell cardId={cardId} />
                ) : null;
              },
            },
          ]
        : NO_COLUMNS,
    [isEnabled],
  );
}

function MetricOwnerCell({ cardId }: { cardId: number }) {
  const { data: card } = useGetCardQuery({ id: cardId });
  const ownerName = card?.creator?.common_name;
  return ownerName ? <Ellipsified>{ownerName}</Ellipsified> : null;
}
