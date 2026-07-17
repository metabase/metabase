import type {
  OnChangeFn,
  Row,
  RowSelectionState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import { type MouseEvent, useCallback, useMemo } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
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
import {
  getNextOptionalSorting,
  getSortingState,
} from "metabase/utils/sorting";
import type { CardId } from "metabase-types/api";

import {
  type ErroringCard,
  type ErroringQuestionsSorting,
  SORT_COLUMNS,
} from "./types";
import { DEFAULT_SORTING } from "./utils";

const COLUMN_WIDTHS = [
  0.14, 0.16, 0.1, 0.08, 0.06, 0.08, 0.09, 0.06, 0.06, 0.09, 0.08,
];

type ErroringQuestionsTableProps = {
  cards: ErroringCard[];
  isLoading: boolean;
  sorting: ErroringQuestionsSorting;
  rowSelection: RowSelectionState;
  rerunningCardIds: Set<CardId>;
  onSortingChange: (sorting: ErroringQuestionsSorting) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
};

export const ErroringQuestionsTable = ({
  cards,
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

  // A rerunning card can't be selected, so "select all" skips it too.
  const isRowSelectable = useCallback(
    (row: Row<ErroringCard>) => !rerunningCardIds.has(row.original.id),
    [rerunningCardIds],
  );

  const getRowHref = useCallback(
    (row: Row<ErroringCard>) => Urls.card({ id: row.original.id }),
    [],
  );

  const handleRowActivate = useCallback(
    (row: Row<ErroringCard>) => {
      dispatch(push(Urls.card({ id: row.original.id })));
    },
    [dispatch],
  );

  const handleRowClick = useCallback(
    (row: Row<ErroringCard>, event: MouseEvent) => {
      const isModifiedClick = event.metaKey || event.shiftKey;
      if (!isModifiedClick) {
        handleRowActivate(row);
      }
    },
    [handleRowActivate],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;
      onSortingChange(
        getNextOptionalSorting(newSortingState, SORT_COLUMNS) ??
          DEFAULT_SORTING,
      );
    },
    [sortingState, onSortingChange],
  );

  const treeTableInstance = useTreeTableInstance<ErroringCard>({
    data: cards,
    columns,
    sorting: sortingState,
    manualSorting: true,
    getNodeId: (card) => String(card.id),
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
          getRowHref={getRowHref}
          onRowClick={handleRowClick}
        />
      )}
    </Card>
  );
};

function getColumns(): TreeTableColumnDef<ErroringCard>[] {
  return [
    {
      id: "card_name",
      header: t`Question`,
      width: "auto",
      minWidth: 150,
      maxAutoWidth: 300,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (card) => card.card_name,
      cell: ({ row }) => <Ellipsified>{row.original.card_name}</Ellipsified>,
    },
    {
      id: "error_substr",
      header: t`Error`,
      width: "auto",
      minWidth: 200,
      maxAutoWidth: 400,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (card) => card.error_substr,
      cell: ({ row }) => (
        <Ellipsified ff="monospace">{row.original.error_substr}</Ellipsified>
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
      accessorFn: (card) => card.collection_name,
      cell: ({ row }) =>
        row.original.collection_name != null ? (
          <Ellipsified>{row.original.collection_name}</Ellipsified>
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
      accessorFn: (card) => card.database_name,
      cell: ({ row }) =>
        row.original.database_name != null ? (
          <Ellipsified>{row.original.database_name}</Ellipsified>
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
      accessorFn: (card) => card.schema_name,
      cell: ({ row }) =>
        row.original.schema_name != null ? (
          <Ellipsified>{row.original.schema_name}</Ellipsified>
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
      accessorFn: (card) => card.table_name,
      cell: ({ row }) =>
        row.original.table_name != null ? (
          <Ellipsified>{row.original.table_name}</Ellipsified>
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
      sortDescFirst: true,
      accessorFn: (card) => card.last_run_at,
      cell: ({ row }) =>
        row.original.last_run_at != null ? (
          <Ellipsified alwaysShowTooltip tooltip={row.original.last_run_at}>
            <DateTime
              value={row.original.last_run_at}
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
      accessorFn: (card) => card.total_runs,
      cell: ({ row }) => row.original.total_runs ?? EMPTY_CELL_PLACEHOLDER,
    },
    {
      id: "num_dashboards",
      header: t`Dashboards it's in`,
      width: "auto",
      minWidth: 100,
      maxAutoWidth: 140,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (card) => card.num_dashboards,
      cell: ({ row }) => row.original.num_dashboards ?? EMPTY_CELL_PLACEHOLDER,
    },
    {
      id: "user_name",
      header: t`Created By`,
      width: "auto",
      minWidth: 110,
      maxAutoWidth: 200,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (card) => card.user_name,
      cell: ({ row }) =>
        row.original.user_name != null ? (
          <Ellipsified>{row.original.user_name}</Ellipsified>
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
      accessorFn: (card) => card.updated_at,
      cell: ({ row }) =>
        row.original.updated_at != null ? (
          <Ellipsified alwaysShowTooltip tooltip={row.original.updated_at}>
            <DateTime value={row.original.updated_at} unit="minute" />
          </Ellipsified>
        ) : (
          EMPTY_CELL_PLACEHOLDER
        ),
    },
  ];
}
