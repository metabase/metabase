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
  CONTENT_DIAGNOSTICS_SLOW_SORT_COLUMNS,
  type ContentDiagnosticsSlowFinding,
  type ContentDiagnosticsSlowSortColumn,
} from "metabase-types/api";

import { SKELETON_COLUMN_WIDTHS, getColumns } from "./columns";

type SlowContentTableProps = {
  findings: ContentDiagnosticsSlowFinding[];
  params: Urls.SlowContentParams;
  sortOptions: Sorting<ContentDiagnosticsSlowSortColumn> | undefined;
  isFetching?: boolean;
  isLoading?: boolean;
  rowSelection: RowSelectionState;
  onSelect?: (finding: ContentDiagnosticsSlowFinding) => void;
  onSortOptionsChange: (
    sortOptions: Sorting<ContentDiagnosticsSlowSortColumn> | undefined,
  ) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
};

export function SlowContentTable({
  findings,
  params,
  sortOptions,
  isFetching = false,
  isLoading = false,
  rowSelection,
  onSelect,
  onSortOptionsChange,
  onRowSelectionChange,
}: SlowContentTableProps) {
  const columns = useMemo(() => getColumns(), []);
  const sortingState = useMemo(
    () => getSortingState(sortOptions),
    [sortOptions],
  );

  const handleRowActivate = useCallback(
    (row: Row<ContentDiagnosticsSlowFinding>) => onSelect?.(row.original),
    [onSelect],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;
      onSortOptionsChange(
        getNextOptionalSorting(
          newSortingState,
          CONTENT_DIAGNOSTICS_SLOW_SORT_COLUMNS,
        ),
      );
    },
    [sortingState, onSortOptionsChange],
  );

  const treeTableInstance = useTreeTableInstance<ContentDiagnosticsSlowFinding>(
    {
      data: findings,
      columns,
      sorting: sortingState,
      manualSorting: true,
      getNodeId: (finding) => String(finding.id),
      enableRowSelection: (row) => row.original.can_write,
      rowSelection,
      onRowActivate: handleRowActivate,
      onRowSelectionChange,
      onSortingChange: handleSortingChange,
    },
  );

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
      data-testid="slow-content-list"
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
            emptyState={<MonitorEmptyState label={t`No slow content found`} />}
            onRowClick={handleRowActivate}
          />
        </>
      )}
    </Card>
  );
}
