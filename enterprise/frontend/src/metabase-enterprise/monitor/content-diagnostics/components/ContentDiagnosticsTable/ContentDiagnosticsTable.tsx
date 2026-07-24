import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useScrollToTop } from "metabase/common/hooks";
import {
  Card,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import {
  type Sorting,
  getNextOptionalSorting,
  getSortingState,
} from "metabase/utils/sorting";
import {
  CONTENT_DIAGNOSTICS_SORT_COLUMNS,
  type ContentDiagnosticsFinding,
  type ContentDiagnosticsSortColumn,
} from "metabase-types/api";

import { DiagnosticsEmptyState } from "../DiagnosticsEmptyState";

import { COLUMN_WIDTHS, getColumns } from "./columns";

type ContentDiagnosticsTableProps = {
  findings: ContentDiagnosticsFinding[];
  page: number;
  sortOptions: Sorting<ContentDiagnosticsSortColumn> | undefined;
  isFetching?: boolean;
  isLoading?: boolean;
  onSelect?: (finding: ContentDiagnosticsFinding) => void;
  onSortOptionsChange: (
    sortOptions: Sorting<ContentDiagnosticsSortColumn> | undefined,
  ) => void;
};

export function ContentDiagnosticsTable({
  findings,
  page,
  sortOptions,
  isFetching = false,
  isLoading = false,
  onSelect,
  onSortOptionsChange,
}: ContentDiagnosticsTableProps) {
  const columns = useMemo(() => getColumns(), []);
  const sortingState = useMemo(
    () => getSortingState(sortOptions),
    [sortOptions],
  );

  const handleRowActivate = useCallback(
    (row: Row<ContentDiagnosticsFinding>) => onSelect?.(row.original),
    [onSelect],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;
      onSortOptionsChange(
        getNextOptionalSorting(newSortingState, CONTENT_DIAGNOSTICS_SORT_COLUMNS),
      );
    },
    [sortingState, onSortOptionsChange],
  );

  const treeTableInstance = useTreeTableInstance<ContentDiagnosticsFinding>({
    data: findings,
    columns,
    sorting: sortingState,
    manualSorting: true,
    getNodeId: (finding) => String(finding.id),
    onRowActivate: handleRowActivate,
    onSortingChange: handleSortingChange,
  });

  useScrollToTop({
    ref: treeTableInstance.containerRef,
    keys: [page, sortOptions],
    skip: isFetching,
  });

  return (
    <Card
      flex="0 1 auto"
      mih={0}
      p={0}
      withBorder
      data-testid="stale-content-list"
    >
      {isLoading ? (
        <TreeTableSkeleton columnWidths={COLUMN_WIDTHS} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          emptyState={
            <DiagnosticsEmptyState label={t`No stale content found`} />
          }
          onRowClick={handleRowActivate}
        />
      )}
    </Card>
  );
}
