import type {
  OnChangeFn,
  Row,
  RowSelectionState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useScrollToTop } from "metabase/common/hooks";
import { MonitorEmptyState } from "metabase/monitor/components/MonitorEmptyState";
import {
  Card,
  LoadingOverlay,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type * as Urls from "metabase/urls";
import {
  type Sorting,
  getNextOptionalSorting,
  getSortingState,
} from "metabase/utils/sorting";
import {
  CONTENT_DIAGNOSTICS_IMBALANCED_SORT_COLUMNS,
  type ContentDiagnosticsImbalancedFinding,
  type ContentDiagnosticsImbalancedSortColumn,
} from "metabase-types/api";

import { SKELETON_COLUMN_WIDTHS, getColumns } from "./columns";

type ImbalancedContentTableProps = {
  findings: ContentDiagnosticsImbalancedFinding[];
  params: Urls.ImbalancedContentParams;
  sortOptions: Sorting<ContentDiagnosticsImbalancedSortColumn> | undefined;
  emptyStateLabel: string;
  isFetching?: boolean;
  isLoading?: boolean;
  enableSelection: boolean;
  rowSelection: RowSelectionState;
  onSelect?: (finding: ContentDiagnosticsImbalancedFinding) => void;
  onSortOptionsChange: (
    sortOptions: Sorting<ContentDiagnosticsImbalancedSortColumn> | undefined,
  ) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
};

export function ImbalancedContentTable({
  findings,
  params,
  sortOptions,
  emptyStateLabel,
  isFetching = false,
  isLoading = false,
  enableSelection,
  rowSelection,
  onSelect,
  onSortOptionsChange,
  onRowSelectionChange,
}: ImbalancedContentTableProps) {
  const columns = useMemo(() => getColumns(), []);
  const sortingState = useMemo(
    () => getSortingState(sortOptions),
    [sortOptions],
  );

  const handleRowActivate = useCallback(
    (row: Row<ContentDiagnosticsImbalancedFinding>) => onSelect?.(row.original),
    [onSelect],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;
      onSortOptionsChange(
        getNextOptionalSorting(
          newSortingState,
          CONTENT_DIAGNOSTICS_IMBALANCED_SORT_COLUMNS,
        ),
      );
    },
    [sortingState, onSortOptionsChange],
  );

  const treeTableInstance =
    useTreeTableInstance<ContentDiagnosticsImbalancedFinding>({
      data: findings,
      columns,
      sorting: sortingState,
      manualSorting: true,
      getNodeId: (finding) => String(finding.id),
      enableRowSelection: enableSelection
        ? (row) => row.original.can_write
        : false,
      rowSelection,
      onRowActivate: handleRowActivate,
      onRowSelectionChange,
      onSortingChange: handleSortingChange,
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
          showCheckboxes={enableSelection}
          columnWidths={SKELETON_COLUMN_WIDTHS}
        />
      ) : (
        <>
          <LoadingOverlay visible={isFetching} data-testid="loading-overlay" />
          <TreeTable
            instance={treeTableInstance}
            showCheckboxes={enableSelection}
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
