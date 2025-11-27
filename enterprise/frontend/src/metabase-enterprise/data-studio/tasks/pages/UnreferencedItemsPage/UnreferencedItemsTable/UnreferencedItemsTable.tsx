import { useMemo } from "react";
import { t } from "ttag";

import type { ColumnOptions } from "metabase/data-grid/types";
import type {
  UnreferencedItem,
  UnreferencedItemSortColumn,
  UnreferencedItemSortDirection,
} from "metabase-types/api";

import {
  EntityCell,
  TasksTable,
  TextCell,
} from "../../../components/TasksTable";

import {
  formatDate,
  getEntityOwnerName,
  getItemIcon,
  getItemName,
  getItemUrl,
  getLastModifiedByName,
  getLastModifiedDate,
  getLastRunDate,
  getRunCount,
} from "./utils";

interface UnreferencedItemsTableProps {
  items: UnreferencedItem[];
  sortColumn?: UnreferencedItemSortColumn;
  sortDirection?: UnreferencedItemSortDirection;
  onSortChange?: (column: UnreferencedItemSortColumn) => void;
  pagination?: {
    total: number;
    pageIndex: number;
    pageSize: number;
    onPageChange: (pageIndex: number) => void;
  };
  isFetching?: boolean;
}

const COLUMN_ID_TO_SORT_COLUMN: Partial<
  Record<string, UnreferencedItemSortColumn>
> = {
  entity: "name",
  runs: "view_count",
};

export function UnreferencedItemsTable({
  items,
  sortColumn,
  sortDirection,
  onSortChange,
  pagination,
  isFetching,
}: UnreferencedItemsTableProps) {
  const columns: ColumnOptions<UnreferencedItem, string>[] = useMemo(
    () => [
      {
        id: "entity",
        name: t`Entity`,
        accessorFn: (item) => getItemName(item),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <EntityCell
              name={getItemName(item)}
              icon={getItemIcon(item)}
              url={getItemUrl(item)}
            />
          );
        },
      },
      {
        id: "entityOwner",
        name: t`Entity owner`,
        accessorFn: (item) => getEntityOwnerName(item) ?? "-",
        cell: ({ getValue }) => <TextCell value={String(getValue())} />,
      },
      {
        id: "lastUpdated",
        name: t`Last updated`,
        accessorFn: (item) => formatDate(getLastModifiedDate(item)),
        cell: ({ getValue }) => <TextCell value={String(getValue())} />,
      },
      {
        id: "lastModifiedBy",
        name: t`Last modified by`,
        accessorFn: (item) => getLastModifiedByName(item) ?? "-",
        cell: ({ getValue }) => <TextCell value={String(getValue())} />,
      },
      {
        id: "runs",
        name: t`Runs`,
        accessorFn: (item) => {
          const count = getRunCount(item);
          return count != null ? String(count) : "-";
        },
        align: "right",
        cell: ({ getValue }) => (
          <TextCell value={String(getValue())} align="right" />
        ),
      },
      {
        id: "lastRun",
        name: t`Last run`,
        accessorFn: (item) => formatDate(getLastRunDate(item)),
        cell: ({ getValue }) => <TextCell value={String(getValue())} />,
      },
    ],
    [],
  );

  return (
    <TasksTable
      data={items}
      columns={columns}
      sortColumn={sortColumn}
      sortDirection={sortDirection}
      columnIdToSortColumn={COLUMN_ID_TO_SORT_COLUMN}
      onSortChange={onSortChange}
      pagination={pagination}
      isFetching={isFetching}
    />
  );
}
