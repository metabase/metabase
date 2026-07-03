import type { SortingState } from "@tanstack/react-table";
import { t } from "ttag";

import { TimezoneIndicator } from "metabase/transforms/components/TimezoneIndicator";
import {
  formatRunMethod,
  formatStatus,
  getRunDurationMs,
  isErrorStatus,
  parseTimestampWithTimezone,
} from "metabase/transforms/utils";
import type { TreeTableColumnDef } from "metabase/ui";
import { Box, Ellipsified, Group, SortableHeaderPill } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { formatDurationLong } from "metabase/utils/formatting/time";
import {
  TRANSFORM_JOB_RUN_SORT_COLUMNS,
  type TransformBatchRun,
  type TransformJobRunSortColumn,
} from "metabase-types/api";

import type { JobRunSortOptions } from "../types";

function getStatusColumn<T extends TransformBatchRun>(): TreeTableColumnDef<T> {
  return {
    id: "status",
    header: t`Status`,
    width: 120,
    accessorFn: (row) => formatStatus(row.status),
    cell: ({ row }) => {
      const { status } = row.original;
      return (
        <Box c={isErrorStatus(status) ? "feedback-negative" : undefined}>
          {formatStatus(status)}
        </Box>
      );
    },
  };
}

function getRunMethodColumn<
  T extends TransformBatchRun,
>(): TreeTableColumnDef<T> {
  return {
    id: "run-method",
    header: t`Trigger`,
    width: "auto",
    accessorFn: (row) => formatRunMethod(row.run_method),
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

function getStartedAtColumn<T extends TransformBatchRun>(
  systemTimezone: string | undefined,
): TreeTableColumnDef<T> {
  return {
    id: "start_time" satisfies TransformJobRunSortColumn,
    header: ({ header }) => (
      <Group gap="xs" wrap="nowrap">
        <SortableHeaderPill
          name={t`Started at`}
          sort={header.column.getIsSorted() || undefined}
        />
        <TimezoneIndicator />
      </Group>
    ),
    width: "auto",
    enableSorting: true,
    accessorFn: (run) =>
      parseTimestampWithTimezone(run.start_time, systemTimezone).format("lll"),
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

function getEndedAtColumn<T extends TransformBatchRun>(
  systemTimezone: string | undefined,
): TreeTableColumnDef<T> {
  return {
    id: "end_time" satisfies TransformJobRunSortColumn,
    header: ({ header }) => (
      <Group gap="xs" wrap="nowrap">
        <SortableHeaderPill
          name={t`Ended at`}
          sort={header.column.getIsSorted() || undefined}
        />
        <TimezoneIndicator />
      </Group>
    ),
    width: "auto",
    enableSorting: true,
    accessorFn: (run) =>
      run.end_time != null
        ? parseTimestampWithTimezone(run.end_time, systemTimezone).format("lll")
        : null,
    cell: ({ getValue }) => {
      const value = getValue<string | null>();
      if (value == null) {
        return EMPTY_CELL_PLACEHOLDER;
      }
      return <Ellipsified>{String(value)}</Ellipsified>;
    },
  };
}

function getDurationColumn<
  T extends TransformBatchRun,
>(): TreeTableColumnDef<T> {
  return {
    id: "duration",
    header: t`Duration`,
    width: 120,
    accessorFn: (run) => getRunDurationMs(run),
    cell: ({ getValue }) => {
      const ms = getValue<number | null>();
      if (ms == null) {
        return EMPTY_CELL_PLACEHOLDER;
      }
      return <Ellipsified>{formatDurationLong(ms)}</Ellipsified>;
    },
  };
}

export function getColumns<T extends TransformBatchRun>(
  systemTimezone: string | undefined,
): TreeTableColumnDef<T>[] {
  return [
    getStatusColumn<T>(),
    getRunMethodColumn<T>(),
    getStartedAtColumn<T>(systemTimezone),
    getEndedAtColumn<T>(systemTimezone),
    getDurationColumn<T>(),
  ];
}

export function getSortingState(
  sortOptions: JobRunSortOptions | undefined,
): SortingState {
  return sortOptions != null
    ? [{ id: sortOptions.column, desc: sortOptions.direction === "desc" }]
    : [];
}

export function getSortingOptions(
  sortingState: SortingState,
): JobRunSortOptions | undefined {
  if (sortingState.length === 0) {
    return undefined;
  }

  const { id, desc } = sortingState[0];
  const column = TRANSFORM_JOB_RUN_SORT_COLUMNS.find((column) => column === id);
  if (column == null) {
    return undefined;
  }

  return { column, direction: desc ? "desc" : "asc" };
}
