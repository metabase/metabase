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
  ContentDiagnosticsDuplicatedFinding,
  ContentDiagnosticsDuplicatedSortColumn,
} from "metabase-types/api";

import {
  type DuplicatedContentParams,
  duplicatedContentConfig,
} from "../../config";
import { useOptionalSortingState } from "../../hooks/use-optional-sorting-state";

import { SKELETON_COLUMN_WIDTHS, getColumns } from "./columns";

type DuplicatedContentTableProps = {
  findings: ContentDiagnosticsDuplicatedFinding[];
  params: DuplicatedContentParams;
  sortOptions: Sorting<ContentDiagnosticsDuplicatedSortColumn> | undefined;
  isFetching?: boolean;
  isLoading?: boolean;
  rowSelection: RowSelectionState;
  onSelect?: (finding: ContentDiagnosticsDuplicatedFinding) => void;
  onSortOptionsChange: (
    sortOptions: Sorting<ContentDiagnosticsDuplicatedSortColumn> | undefined,
  ) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
};

export function DuplicatedContentTable({
  findings,
  params,
  sortOptions,
  isFetching = false,
  isLoading = false,
  rowSelection,
  onSelect,
  onSortOptionsChange,
  onRowSelectionChange,
}: DuplicatedContentTableProps) {
  const getIcon = useGetIcon();
  const columns = useMemo(() => getColumns(getIcon), [getIcon]);
  const { sortingState, onSortingChange } = useOptionalSortingState({
    sortOptions,
    columns: duplicatedContentConfig.sortColumns,
    onSortOptionsChange,
  });

  const handleRowActivate = useCallback(
    (row: Row<ContentDiagnosticsDuplicatedFinding>) => onSelect?.(row.original),
    [onSelect],
  );

  const treeTableInstance =
    useTreeTableInstance<ContentDiagnosticsDuplicatedFinding>({
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
      data-testid="duplicated-content-list"
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
            emptyState={
              <MonitorEmptyState label={t`No duplicated content found`} />
            }
            onRowClick={handleRowActivate}
          />
        </>
      )}
    </Card>
  );
}
