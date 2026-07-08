import type {
  OnChangeFn,
  Row,
  RowSelectionState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { useDispatch } from "metabase/redux";
import {
  Card,
  Ellipsified,
  Stack,
  Text,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { getSorting, getSortingState } from "metabase/utils/sorting";

import {
  type ErroringQuestion,
  type ErroringQuestionsSorting,
  SORT_COLUMNS,
} from "./types";

const COLUMN_WIDTHS = [
  0.14, 0.16, 0.1, 0.08, 0.06, 0.08, 0.09, 0.06, 0.06, 0.09, 0.08,
];

type ErroringQuestionsTableProps = {
  questions: ErroringQuestion[];
  isLoading: boolean;
  sorting: ErroringQuestionsSorting;
  rowSelection: RowSelectionState;
  rerunningCardIds: Set<number>;
  onSortingChange: (sorting: ErroringQuestionsSorting) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
};

export const ErroringQuestionsTable = ({
  questions,
  isLoading,
  sorting,
  rowSelection,
  rerunningCardIds,
  onSortingChange,
  onRowSelectionChange,
}: ErroringQuestionsTableProps) => {
  const dispatch = useDispatch();

  const columns = useMemo(() => getColumns(), []);
  const sortingState = useMemo(() => getSortingState(sorting), [sorting]);

  // A rerunning question can't be selected, so "select all" skips it too.
  const isRowSelectable = useCallback(
    (row: Row<ErroringQuestion>) => !rerunningCardIds.has(row.original.id),
    [rerunningCardIds],
  );

  const handleRowActivate = useCallback(
    (row: Row<ErroringQuestion>) => {
      dispatch(push(Urls.card({ id: row.original.id })));
    },
    [dispatch],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;
      onSortingChange(getSorting(newSortingState, SORT_COLUMNS, sorting));
    },
    [sortingState, sorting, onSortingChange],
  );

  const treeTableInstance = useTreeTableInstance<ErroringQuestion>({
    data: questions,
    columns,
    sorting: sortingState,
    manualSorting: true,
    getNodeId: (question) => String(question.id),
    enableRowSelection: isRowSelectable,
    rowSelection,
    onRowSelectionChange,
    onRowActivate: handleRowActivate,
    onSortingChange: handleSortingChange,
  });

  return (
    <Card
      flex="0 1 auto"
      mih={0}
      p={0}
      withBorder
      data-testid="erroring-questions-table"
    >
      {isLoading ? (
        <TreeTableSkeleton showCheckboxes columnWidths={COLUMN_WIDTHS} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          hierarchical={false}
          showCheckboxes
          onHeaderCheckboxClick={() =>
            treeTableInstance.table.toggleAllRowsSelected()
          }
          headerCheckboxAriaLabel={t`Select all`}
          ariaLabel={t`Erroring questions`}
          isRowLoading={(row) => rerunningCardIds.has(row.original.id)}
          emptyState={
            <Stack p="xl" align="center">
              <Text c="text-disabled">{t`No results`}</Text>
            </Stack>
          }
          getRowProps={() => ({ "data-testid": "erroring-question" })}
          onRowClick={handleRowActivate}
        />
      )}
    </Card>
  );
};

function getColumns(): TreeTableColumnDef<ErroringQuestion>[] {
  return [
    {
      id: "card_name",
      header: t`Question`,
      width: "auto",
      minWidth: 150,
      maxAutoWidth: 300,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (question) => question.name,
      cell: ({ row }) => (
        <Ellipsified fw="bold">{row.original.name}</Ellipsified>
      ),
    },
    {
      id: "error_substr",
      header: t`Error`,
      width: "auto",
      minWidth: 200,
      maxAutoWidth: 400,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (question) => question.error,
      cell: ({ row }) => (
        <Ellipsified ff="monospace">{row.original.error}</Ellipsified>
      ),
    },
    {
      id: "collection_name",
      header: t`Collection`,
      width: "auto",
      minWidth: 120,
      maxAutoWidth: 240,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (question) => question.collectionName,
      cell: ({ row }) =>
        row.original.collectionName != null ? (
          <Ellipsified>{row.original.collectionName}</Ellipsified>
        ) : (
          EMPTY_CELL_PLACEHOLDER
        ),
    },
    {
      id: "database_name",
      header: t`Database`,
      width: "auto",
      minWidth: 100,
      maxAutoWidth: 200,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (question) => question.databaseName,
      cell: ({ row }) =>
        row.original.databaseName != null ? (
          <Ellipsified>{row.original.databaseName}</Ellipsified>
        ) : (
          EMPTY_CELL_PLACEHOLDER
        ),
    },
    {
      id: "schema_name",
      header: t`Schema`,
      width: "auto",
      minWidth: 90,
      maxAutoWidth: 160,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (question) => question.schemaName,
      cell: ({ row }) =>
        row.original.schemaName != null ? (
          <Ellipsified>{row.original.schemaName}</Ellipsified>
        ) : (
          EMPTY_CELL_PLACEHOLDER
        ),
    },
    {
      id: "table_name",
      header: t`Table`,
      width: "auto",
      minWidth: 100,
      maxAutoWidth: 200,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (question) => question.tableName,
      cell: ({ row }) =>
        row.original.tableName != null ? (
          <Ellipsified>{row.original.tableName}</Ellipsified>
        ) : (
          EMPTY_CELL_PLACEHOLDER
        ),
    },
    {
      id: "last_run_at",
      header: t`Last run at`,
      width: "auto",
      minWidth: 130,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (question) => question.lastRunAt,
      cell: ({ row }) =>
        row.original.lastRunAt != null ? (
          <Ellipsified alwaysShowTooltip tooltip={row.original.lastRunAt}>
            <DateTime
              value={row.original.lastRunAt}
              unit="minute"
              data-testid="last-run-at"
            />
          </Ellipsified>
        ) : (
          EMPTY_CELL_PLACEHOLDER
        ),
    },
    {
      id: "total_runs",
      header: t`Total runs`,
      width: "auto",
      minWidth: 90,
      maxAutoWidth: 120,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (question) => question.totalRuns,
      cell: ({ row }) => row.original.totalRuns ?? EMPTY_CELL_PLACEHOLDER,
    },
    {
      id: "num_dashboards",
      header: t`Dashboards it's in`,
      width: "auto",
      minWidth: 100,
      maxAutoWidth: 140,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (question) => question.dashboardCount,
      cell: ({ row }) => row.original.dashboardCount ?? EMPTY_CELL_PLACEHOLDER,
    },
    {
      id: "user_name",
      header: t`Created By`,
      width: "auto",
      minWidth: 110,
      maxAutoWidth: 200,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (question) => question.createdBy,
      cell: ({ row }) =>
        row.original.createdBy != null ? (
          <Ellipsified>{row.original.createdBy}</Ellipsified>
        ) : (
          EMPTY_CELL_PLACEHOLDER
        ),
    },
    {
      id: "updated_at",
      header: t`Updated At`,
      width: "auto",
      minWidth: 130,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (question) => question.updatedAt,
      cell: ({ row }) =>
        row.original.updatedAt != null ? (
          <Ellipsified alwaysShowTooltip tooltip={row.original.updatedAt}>
            <DateTime value={row.original.updatedAt} unit="minute" />
          </Ellipsified>
        ) : (
          EMPTY_CELL_PLACEHOLDER
        ),
    },
  ];
}
