import type {
  OnChangeFn,
  Row,
  RowSelectionState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useScrollToTop } from "metabase/common/hooks";
import { MonitorEmptyState } from "metabase/monitor/components/MonitorEmptyState";
import { MonitorTableCard } from "metabase/monitor/components/MonitorTableCard";
import {
  Card,
  LoadingOverlay,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";

type MonitorEntityRow = { id: string };

type MonitorEntityTableProps<TRow extends MonitorEntityRow> = {
  /** Undefined until the first page loads, which shows a skeleton. */
  rows: TRow[] | undefined;
  columns: TreeTableColumnDef<TRow>[];
  skeletonColumnWidths: number[];
  error: unknown;
  isFetching: boolean;
  showCheckboxes: boolean;
  canSelectRow: (row: Row<TRow>) => boolean;
  page: number;
  rowSelection: RowSelectionState;
  selectedRowId: TRow["id"] | undefined;
  sorting: SortingState;
  ariaLabel: string;
  emptyLabel: string;
  getRowTestId: (row: TRow) => string;
  onSortingChange: (sorting: SortingState) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  onRowClick: (id: TRow["id"]) => void;
  "data-testid": string;
};

const NO_ROWS: never[] = [];

const getNodeId = (row: MonitorEntityRow) => row.id;

/** A server-sorted, paged Monitor list whose rows open a detail sidebar and can be selected for a bulk action. */
export function MonitorEntityTable<TRow extends MonitorEntityRow>({
  rows,
  columns,
  skeletonColumnWidths,
  error,
  isFetching,
  showCheckboxes,
  canSelectRow,
  page,
  rowSelection,
  selectedRowId,
  sorting,
  ariaLabel,
  emptyLabel,
  getRowTestId,
  onSortingChange,
  onRowSelectionChange,
  onRowClick,
  "data-testid": dataTestId,
}: MonitorEntityTableProps<TRow>) {
  const activeRowId = selectedRowId ?? null;

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    [sorting, onSortingChange],
  );

  const handleRowActivate = useCallback(
    (row: Row<TRow>) => {
      onRowClick(row.original.id);
    },
    [onRowClick],
  );

  const instance = useTreeTableInstance<TRow>({
    data: rows ?? NO_ROWS,
    columns,
    getNodeId,
    sorting,
    manualSorting: true,
    enableRowSelection: canSelectRow,
    rowSelection,
    onRowSelectionChange,
    onSortingChange: handleSortingChange,
    onRowActivate: handleRowActivate,
    selectedRowId: activeRowId,
  });

  const { setActiveRowId } = instance;
  useEffect(() => {
    setActiveRowId(activeRowId);
  }, [activeRowId, setActiveRowId]);

  useScrollToTop({
    ref: instance.containerRef,
    keys: [page, sorting],
    skip: isFetching,
  });

  const getRowProps = useCallback(
    (row: Row<TRow>) => ({ "data-testid": getRowTestId(row.original) }),
    [getRowTestId],
  );

  if (error !== undefined) {
    return (
      <Card flex="0 1 auto" mih={0} withBorder p="xl" data-testid={dataTestId}>
        <LoadingAndErrorWrapper error={error} />
      </Card>
    );
  }

  return (
    <MonitorTableCard aria-busy={isFetching} data-testid={dataTestId}>
      {rows === undefined ? (
        <TreeTableSkeleton
          showCheckboxes={showCheckboxes}
          columnWidths={skeletonColumnWidths}
        />
      ) : (
        <>
          <LoadingOverlay visible={isFetching} data-testid="loading-overlay" />
          <TreeTable
            instance={instance}
            hierarchical={false}
            showCheckboxes={showCheckboxes}
            onHeaderCheckboxClick={() => instance.table.toggleAllRowsSelected()}
            headerCheckboxAriaLabel={t`Select all`}
            ariaLabel={ariaLabel}
            onRowClick={handleRowActivate}
            getRowProps={getRowProps}
            emptyState={<MonitorEmptyState label={emptyLabel} />}
          />
        </>
      )}
    </MonitorTableCard>
  );
}
