import { useElementSize } from "@mantine/hooks";
import type React from "react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { getFormattedTime } from "metabase/common/components/DateTime/DateTime";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { BaseCell } from "metabase/data-grid";
import { DataGrid } from "metabase/data-grid/components/DataGrid/DataGrid";
import { useDataGridInstance } from "metabase/data-grid/hooks/use-data-grid-instance";
import type { ColumnOptions } from "metabase/data-grid/types";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import { Anchor, Box, Flex, Icon } from "metabase/ui";
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

import S from "./UnreferencedItemsTable.module.css";

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

const ROW_HEIGHT = 48;

const centeredCellStyles = { alignItems: "center" } as const;

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
}: UnreferencedItemsTableProps) {
  const getSortDirectionForColumn = useCallback(
    (columnId: string): "asc" | "desc" | undefined => {
      const apiColumn = COLUMN_ID_TO_SORT_COLUMN[columnId];
      if (apiColumn && apiColumn === sortColumn) {
        return sortDirection;
      }
      return undefined;
    },
    [sortColumn, sortDirection],
  );

  const columns: ColumnOptions<UnreferencedItem, string>[] = useMemo(
    () => [
      {
        id: "entity",
        name: t`Entity`,
        accessorFn: (item) => getItemName(item),
        sortDirection: getSortDirectionForColumn("entity"),
        cell: ({ row }) => {
          const item = row.original;
          const url = getItemUrl(item);
          const name = getItemName(item);
          const icon = getItemIcon(item);
          return (
            <BaseCell style={centeredCellStyles}>
              {url ? (
                <Anchor href={url} className={S.cellContent}>
                  <Flex align="center" gap="sm">
                    <Icon name={icon} className={S.iconNoShrink} />
                    <Ellipsified>{name}</Ellipsified>
                  </Flex>
                </Anchor>
              ) : (
                <Flex align="center" gap="sm" className={S.cellContent}>
                  <Icon
                    name={icon}
                    c="text-medium"
                    className={S.iconNoShrink}
                  />
                  <Ellipsified>{name}</Ellipsified>
                </Flex>
              )}
            </BaseCell>
          );
        },
      },
      {
        id: "creator",
        name: t`Creator`,
        accessorFn: (item) => getCreatorName(item) ?? "-",
        cell: ({ getValue }) => (
          <BaseCell style={centeredCellStyles}>
            <Ellipsified>{String(getValue())}</Ellipsified>
          </BaseCell>
        ),
      },
      {
        id: "lastModified",
        name: t`Last modified`,
        accessorFn: (item) => formatDate(getLastModifiedDate(item)),
        cell: ({ getValue }) => (
          <BaseCell style={centeredCellStyles}>
            <Ellipsified>{String(getValue())}</Ellipsified>
          </BaseCell>
        ),
      },
      {
        id: "lastModifiedBy",
        name: t`Last modified by`,
        accessorFn: (item) => getLastModifiedByName(item) ?? "-",
        cell: ({ getValue }) => (
          <BaseCell style={centeredCellStyles}>
            <Ellipsified>{String(getValue())}</Ellipsified>
          </BaseCell>
        ),
      },
      {
        id: "runs",
        name: t`Runs`,
        accessorFn: (item) => {
          const count = getRunCount(item);
          return count != null ? String(count) : "-";
        },
        align: "right",
        sortDirection: getSortDirectionForColumn("runs"),
        cell: ({ getValue }) => (
          <BaseCell align="right" style={centeredCellStyles}>
            <Ellipsified>{String(getValue())}</Ellipsified>
          </BaseCell>
        ),
      },
    ],
    [getSortDirectionForColumn],
  );

  const { ref: containerRef, width: containerWidth } = useElementSize();

  const theme = useMemo(() => ({ fontSize: "14px", headerHeight: 58 }), []);

  const tableProps = useDataGridInstance({
    data: items,
    columnsOptions: columns,
    defaultRowHeight: ROW_HEIGHT,
    theme,
    minGridWidth: containerWidth || undefined,
    pageSize: pagination?.pageSize,
    total: pagination?.total,
    pageIndex: pagination?.pageIndex,
    onPageChange: pagination?.onPageChange,
  });

  const handleHeaderCellClick = useCallback(
    (_event: React.MouseEvent<HTMLDivElement>, columnId?: string) => {
      if (!columnId || !onSortChange) {
        return;
      }
      const apiColumn = COLUMN_ID_TO_SORT_COLUMN[columnId];
      if (apiColumn) {
        onSortChange(apiColumn);
      }
    },
    [onSortChange],
  );

  return (
    <Box
      ref={containerRef}
      h="100%"
      bd="1px solid var(--mb-color-border)"
      className={S.tableContainer}
    >
      {containerWidth > 0 ? (
        <DataGrid {...tableProps} onHeaderCellClick={handleHeaderCellClick} />
      ) : null}
    </Box>
  );
}
