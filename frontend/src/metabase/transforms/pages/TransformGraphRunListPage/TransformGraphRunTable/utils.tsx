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
  TRANSFORM_GRAPH_RUN_SORT_COLUMNS,
  type TransformGraphRun,
  type TransformGraphRunSortColumn,
} from "metabase-types/api";

import type { TransformGraphRunSortOptions } from "../types";

// A graph-run id is only unique within its run_type, so combine both for a stable key.
export function getRowKey(run: TransformGraphRun): string {
  return `${run.run_type}-${run.id}`;
}

// The "Run" identity — also used as the sidebar title. For DAG runs it reads as
// "Upstream → name" / "name → Downstream". Wording is provisional (design TBD).
export function getRunName(run: TransformGraphRun): string {
  const name = run.name ?? t`Deleted`;
  if (run.run_type === "dag") {
    return run.direction === "upstream"
      ? `${t`Upstream`} → ${name}`
      : `${name} → ${t`Downstream`}`;
  }
  return name;
}

export function getRunTypeLabel(run: TransformGraphRun): string {
  // DAG runs are surfaced as plain "Transformation" for now (design TBD).
  return run.run_type === "job" ? t`Job` : t`Transformation`;
}

function getRunColumn(): TreeTableColumnDef<TransformGraphRun> {
  return {
    id: "run",
    header: t`Run`,
    width: 320,
    accessorFn: (run) => getRunName(run),
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

function getTypeColumn(): TreeTableColumnDef<TransformGraphRun> {
  return {
    id: "type",
    header: t`Type`,
    width: 140,
    accessorFn: (run) => getRunTypeLabel(run),
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

function getStatusColumn(): TreeTableColumnDef<TransformGraphRun> {
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

function getRunMethodColumn(): TreeTableColumnDef<TransformGraphRun> {
  return {
    id: "run-method",
    header: t`Trigger`,
    width: 120,
    accessorFn: (row) =>
      row.run_method != null ? formatRunMethod(row.run_method) : null,
    cell: ({ getValue }) => {
      const value = getValue<string | null>();
      if (value == null) {
        return EMPTY_CELL_PLACEHOLDER;
      }
      return <Ellipsified>{value}</Ellipsified>;
    },
  };
}

function getStartedAtColumn(
  systemTimezone: string | undefined,
): TreeTableColumnDef<TransformGraphRun> {
  return {
    id: "start_time" satisfies TransformGraphRunSortColumn,
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

function getEndedAtColumn(
  systemTimezone: string | undefined,
): TreeTableColumnDef<TransformGraphRun> {
  return {
    id: "end_time" satisfies TransformGraphRunSortColumn,
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

function getDurationColumn(): TreeTableColumnDef<TransformGraphRun> {
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

export function getColumns(
  systemTimezone: string | undefined,
): TreeTableColumnDef<TransformGraphRun>[] {
  return [
    getRunColumn(),
    getTypeColumn(),
    getStartedAtColumn(systemTimezone),
    getEndedAtColumn(systemTimezone),
    getDurationColumn(),
    getStatusColumn(),
    getRunMethodColumn(),
  ];
}

export function getSortingState(
  sortOptions: TransformGraphRunSortOptions | undefined,
): SortingState {
  return sortOptions != null
    ? [{ id: sortOptions.column, desc: sortOptions.direction === "desc" }]
    : [];
}

export function getSortingOptions(
  sortingState: SortingState,
): TransformGraphRunSortOptions | undefined {
  if (sortingState.length === 0) {
    return undefined;
  }

  const { id, desc } = sortingState[0];
  const column = TRANSFORM_GRAPH_RUN_SORT_COLUMNS.find(
    (column) => column === id,
  );
  if (column == null) {
    return undefined;
  }

  return { column, direction: desc ? "desc" : "asc" };
}
