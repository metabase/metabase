import type { OnChangeFn, Row, RowSelectionState } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useScrollToTop, useSortingStateChange } from "metabase/common/hooks";
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
  toSorting,
  toSortingOptions,
} from "metabase/utils/sorting";
import type {
  ContentDiagnosticsStaleFinding,
  ContentDiagnosticsStaleSortColumn,
} from "metabase-types/api";

import { staleContentConfig } from "../../config";

import { SKELETON_COLUMN_WIDTHS, getColumns } from "./columns";

type StaleContentTableProps = {
  findings: ContentDiagnosticsStaleFinding[];
  params: Urls.StaleContentParams;
  sortOptions: Sorting<ContentDiagnosticsStaleSortColumn> | undefined;
  isFetching?: boolean;
  isLoading?: boolean;
  rowSelection: RowSelectionState;
  onSelect?: (finding: ContentDiagnosticsStaleFinding) => void;
  onSortOptionsChange: (
    sortOptions: Sorting<ContentDiagnosticsStaleSortColumn> | undefined,
  ) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
};

export function StaleContentTable({
  findings,
  params,
  sortOptions,
  isFetching = false,
  isLoading = false,
  rowSelection,
  onSelect,
  onSortOptionsChange,
  onRowSelectionChange,
}: StaleContentTableProps) {
  const columns = useMemo(() => getColumns(), []);
  const { sortingState, onSortingChange } = useSortingStateChange({
    sortingOptions:
      sortOptions == null ? undefined : toSortingOptions(sortOptions),
    columns: staleContentConfig.sortColumns,
    onSortingOptionsChange: (options) =>
      onSortOptionsChange(options == null ? undefined : toSorting(options)),
  });

  const handleRowActivate = useCallback(
    (row: Row<ContentDiagnosticsStaleFinding>) => onSelect?.(row.original),
    [onSelect],
  );

  const treeTableInstance =
    useTreeTableInstance<ContentDiagnosticsStaleFinding>({
      data: findings,
      columns,
      sorting: sortingState,
      manualSorting: true,
      getNodeId: (finding) => String(finding.id),
      enableRowSelection: (row) => row.original.can_write,
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
      data-testid="stale-content-list"
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
            emptyState={<MonitorEmptyState label={t`No stale content found`} />}
            onRowClick={handleRowActivate}
          />
        </>
      )}
    </Card>
  );
}
