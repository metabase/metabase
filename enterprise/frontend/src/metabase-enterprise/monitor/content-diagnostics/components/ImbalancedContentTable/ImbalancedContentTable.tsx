import type { OnChangeFn, Row, RowSelectionState } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useScrollToTop } from "metabase/common/hooks";
import { useGetIcon } from "metabase/hooks/use-icon";
import { MonitorEmptyState } from "metabase/monitor/components/MonitorEmptyState";
import {
  Card,
  LoadingOverlay,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type { Sorting } from "metabase/utils/sorting";
import type {
  ContentDiagnosticsImbalancedFinding,
  ContentDiagnosticsImbalancedFindingType,
  ContentDiagnosticsImbalancedSortColumn,
} from "metabase-types/api";

import {
  type ImbalancedContentParams,
  getImbalancedContentConfig,
} from "../../config";
import { useOptionalSortingState } from "../../hooks/use-optional-sorting-state";

import { SKELETON_COLUMN_WIDTHS, getColumns } from "./columns";

type ImbalancedContentTableProps = {
  mode: ContentDiagnosticsImbalancedFindingType;
  findings: ContentDiagnosticsImbalancedFinding[];
  params: ImbalancedContentParams;
  sortOptions: Sorting<ContentDiagnosticsImbalancedSortColumn> | undefined;
  emptyStateLabel: string;
  isFetching?: boolean;
  isLoading?: boolean;
  rowSelection: RowSelectionState;
  onSelect?: (finding: ContentDiagnosticsImbalancedFinding) => void;
  onSortOptionsChange: (
    sortOptions: Sorting<ContentDiagnosticsImbalancedSortColumn> | undefined,
  ) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
};

export function ImbalancedContentTable({
  mode,
  findings,
  params,
  sortOptions,
  emptyStateLabel,
  isFetching = false,
  isLoading = false,
  rowSelection,
  onSelect,
  onSortOptionsChange,
  onRowSelectionChange,
}: ImbalancedContentTableProps) {
  const getIcon = useGetIcon();
  const columns = useMemo(() => getColumns(mode, getIcon), [mode, getIcon]);
  const { sortingState, onSortingChange } = useOptionalSortingState({
    sortOptions,
    columns: getImbalancedContentConfig(mode).sortColumns,
    onSortOptionsChange,
  });

  const handleRowActivate = useCallback(
    (row: Row<ContentDiagnosticsImbalancedFinding>) => onSelect?.(row.original),
    [onSelect],
  );

  const treeTableInstance =
    useTreeTableInstance<ContentDiagnosticsImbalancedFinding>({
      data: findings,
      columns,
      sorting: sortingState,
      manualSorting: true,
      getNodeId: (finding) => String(finding.id),
      enableRowSelection: true,
      rowSelection,
      onRowActivate: handleRowActivate,
      onRowSelectionChange,
      onSortingChange,
    });

  useScrollToTop({
    ref: treeTableInstance.containerRef,
    keys: [params],
    skip: isFetching,
  });

  return (
    <Card
      flex="0 1 auto"
      mih={0}
      p={0}
      pos="relative"
      withBorder
      data-testid="imbalanced-content-list"
    >
      {isLoading ? (
        <TreeTableSkeleton
          showCheckboxes
          columnWidths={SKELETON_COLUMN_WIDTHS}
        />
      ) : (
        <>
          <LoadingOverlay visible={isFetching} data-testid="loading-overlay" />
          <TreeTable
            instance={treeTableInstance}
            showCheckboxes
            onHeaderCheckboxClick={() =>
              treeTableInstance.table.toggleAllRowsSelected()
            }
            headerCheckboxAriaLabel={t`Select all`}
            emptyState={<MonitorEmptyState label={emptyStateLabel} />}
            onRowClick={handleRowActivate}
          />
        </>
      )}
    </Card>
  );
}
