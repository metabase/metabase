import { useMemo } from "react";
import { t } from "ttag";

import { getFormattedTime } from "metabase/common/components/DateTime/DateTime";
import type { ColumnOptions } from "metabase/data-grid/types";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import type {
  CardDependencyNode,
  DashboardDependencyNode,
  DocumentDependencyNode,
  SandboxDependencyNode,
  SnippetDependencyNode,
  TableDependencyNode,
  TransformDependencyNode,
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

type CardItem = Omit<CardDependencyNode, "dependents_count">;
type DashboardItem = Omit<DashboardDependencyNode, "dependents_count">;
type DocumentItem = Omit<DocumentDependencyNode, "dependents_count">;
type TableItem = Omit<TableDependencyNode, "dependents_count">;
type SandboxItem = Omit<SandboxDependencyNode, "dependents_count">;
type TransformItem = Omit<TransformDependencyNode, "dependents_count">;
type SnippetItem = Omit<SnippetDependencyNode, "dependents_count">;

function isCardItem(item: UnreferencedItem): item is CardItem {
  return item.type === "card";
}

function isDashboardItem(item: UnreferencedItem): item is DashboardItem {
  return item.type === "dashboard";
}

function isDocumentItem(item: UnreferencedItem): item is DocumentItem {
  return item.type === "document";
}

function isTableItem(item: UnreferencedItem): item is TableItem {
  return item.type === "table";
}

function isSandboxItem(item: UnreferencedItem): item is SandboxItem {
  return item.type === "sandbox";
}

function isTransformItem(item: UnreferencedItem): item is TransformItem {
  return item.type === "transform";
}

function isSnippetItem(item: UnreferencedItem): item is SnippetItem {
  return item.type === "snippet";
}

function getItemName(item: UnreferencedItem): string {
  if (isSandboxItem(item)) {
    return item.data.table?.display_name ?? `Table ${item.data.table_id}`;
  }
  if (isTableItem(item)) {
    return item.data.display_name ?? item.data.name;
  }
  if (isCardItem(item)) {
    return item.data.name;
  }
  if (isDashboardItem(item)) {
    return item.data.name;
  }
  if (isDocumentItem(item)) {
    return item.data.name;
  }
  if (isTransformItem(item)) {
    return item.data.name;
  }
  if (isSnippetItem(item)) {
    return item.data.name;
  }
  return "";
}

function getItemUrl(item: UnreferencedItem): string | null {
  if (isCardItem(item)) {
    return Urls.question({ id: item.id, name: item.data.name });
  }
  if (isDashboardItem(item)) {
    return Urls.dashboard({ id: item.id, name: item.data.name });
  }
  if (isTableItem(item)) {
    return Urls.tableRowsQuery(item.data.db_id, item.id);
  }
  if (isTransformItem(item)) {
    return Urls.transform(item.id);
  }
  if (isDocumentItem(item)) {
    return Urls.document({ id: item.id });
  }
  return null;
}

function getItemIcon(item: UnreferencedItem): IconName {
  if (isCardItem(item)) {
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
  if (isDashboardItem(item)) {
    return "dashboard";
  }
  if (isTableItem(item)) {
    return "table";
  }
  if (isTransformItem(item)) {
    return "transform";
  }
  if (isSnippetItem(item)) {
    return "snippet";
  }
  if (isDocumentItem(item)) {
    return "document";
  }
  if (isSandboxItem(item)) {
    return "table";
  }
  return "unknown";
}

function getCreatorName(item: UnreferencedItem): string | null {
  if (
    isCardItem(item) ||
    isDashboardItem(item) ||
    isDocumentItem(item) ||
    isTransformItem(item)
  ) {
    const { creator } = item.data;
    if (creator) {
      return (
        creator.common_name ?? `${creator.first_name} ${creator.last_name}`
      );
    }
  }
  return null;
}

function getLastModifiedDate(item: UnreferencedItem): string | null {
  if (isCardItem(item) || isDashboardItem(item)) {
    const lastEdit = item.data["last-edit-info"];
    if (lastEdit?.timestamp) {
      return lastEdit.timestamp;
    }
    return item.data.created_at ?? null;
  }
  if (isDocumentItem(item)) {
    return item.data.created_at ?? null;
  }
  return null;
}

function getLastModifiedByName(item: UnreferencedItem): string | null {
  if (isCardItem(item) || isDashboardItem(item)) {
    const lastEdit = item.data["last-edit-info"];
    if (lastEdit) {
      return `${lastEdit.first_name} ${lastEdit.last_name}`;
    }
  }
  return null;
}

function getRunCount(item: UnreferencedItem): number | null {
  if (isCardItem(item) || isDashboardItem(item) || isDocumentItem(item)) {
    return item.data.view_count ?? null;
  }
  return null;
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
        id: "creator",
        name: t`Creator`,
        accessorFn: (item) => getCreatorName(item) ?? "-",
        cell: ({ getValue }) => <TextCell value={String(getValue())} />,
      },
      {
        id: "lastModified",
        name: t`Last modified`,
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
