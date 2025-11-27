import { useMemo } from "react";
import { t } from "ttag";

import { getFormattedTime } from "metabase/common/components/DateTime/DateTime";
import type { ColumnOptions } from "metabase/data-grid/types";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
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

function getItemName(item: UnreferencedItem): string {
  switch (item.type) {
    case "sandbox":
      return item.data.table?.display_name ?? `Table ${item.data.table_id}`;
    case "table":
      return item.data.display_name ?? item.data.name;
    case "card":
    case "dashboard":
    case "document":
    case "transform":
    case "snippet":
      return item.data.name;
  }
}

function getItemUrl(item: UnreferencedItem): string | null {
  switch (item.type) {
    case "card":
      return Urls.question({ id: item.id, name: item.data.name });
    case "dashboard":
      return Urls.dashboard({ id: item.id, name: item.data.name });
    case "table":
      return Urls.tableRowsQuery(item.data.db_id, item.id);
    case "transform":
      return Urls.transform(item.id);
    case "document":
      return Urls.document({ id: item.id });
    case "snippet":
    case "sandbox":
      return null;
  }
}

function getItemIcon(item: UnreferencedItem): IconName {
  switch (item.type) {
    case "card": {
      const { type: cardType, display } = item.data;
      if (cardType === "model") {
        return "model";
      }
      if (cardType === "metric") {
        return "metric";
      }
      if (display) {
        return getIconForVisualizationType(display);
      }
      return "table";
    }
    case "dashboard":
      return "dashboard";
    case "table":
    case "sandbox":
      return "table";
    case "transform":
      return "transform";
    case "snippet":
      return "snippet";
    case "document":
      return "document";
  }
}

function getEntityOwnerName(item: UnreferencedItem): string | null {
  switch (item.type) {
    case "table": {
      const { owner } = item.data;
      return owner ? `${owner.first_name} ${owner.last_name}` : null;
    }
    case "card":
    case "dashboard":
    case "document":
    case "transform": {
      const { creator } = item.data;
      return creator
        ? (creator.common_name ?? `${creator.first_name} ${creator.last_name}`)
        : null;
    }
    case "snippet":
    case "sandbox":
      return null;
  }
}

function getLastRunDate(item: UnreferencedItem): string | null {
  if (item.type === "transform") {
    return item.data.last_run?.start_time ?? null;
  }
  return null;
}

function getLastModifiedDate(item: UnreferencedItem): string | null {
  switch (item.type) {
    case "card":
    case "dashboard": {
      const lastEdit = item.data["last-edit-info"];
      if (lastEdit?.timestamp) {
        return lastEdit.timestamp;
      }
      return item.data.created_at ?? null;
    }
    case "document":
      return item.data.created_at ?? null;
    case "table":
    case "transform":
    case "snippet":
    case "sandbox":
      return null;
  }
}

function getLastModifiedByName(item: UnreferencedItem): string | null {
  switch (item.type) {
    case "card":
    case "dashboard": {
      const lastEdit = item.data["last-edit-info"];
      if (lastEdit) {
        return `${lastEdit.first_name} ${lastEdit.last_name}`;
      }
      return null;
    }
    case "table":
    case "document":
    case "transform":
    case "snippet":
    case "sandbox":
      return null;
  }
}

function getRunCount(item: UnreferencedItem): number | null {
  switch (item.type) {
    case "card":
    case "dashboard":
    case "document":
    case "table":
      return item.data.view_count ?? null;
    case "transform":
    case "snippet":
    case "sandbox":
      return null;
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) {
    return "-";
  }
  return String(getFormattedTime(dateString, "minute"));
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
