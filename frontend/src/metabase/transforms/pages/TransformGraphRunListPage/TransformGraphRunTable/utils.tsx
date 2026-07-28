import type { SortingState } from "@tanstack/react-table";
import { msgid, ngettext, t } from "ttag";

import { TimezoneIndicator } from "metabase/transforms/components/TimezoneIndicator";
import {
  formatRunMethod,
  formatStatus,
  getRunDurationMs,
  isErrorStatus,
  parseTimestampWithTimezone,
} from "metabase/transforms/utils";
import type { MantineSize, TreeTableColumnDef } from "metabase/ui";
import {
  Box,
  Ellipsified,
  Flex,
  Group,
  Icon,
  SortableHeaderPill,
  Text,
  Tooltip,
} from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { formatDurationLong } from "metabase/utils/formatting/time";
import {
  TRANSFORM_GRAPH_RUN_SORT_COLUMNS,
  type TransformGraphRun,
  type TransformGraphRunSortColumn,
} from "metabase-types/api";

import type { TransformGraphRunSortOptions } from "../types";

export function getRowKey(run: TransformGraphRun): string {
  return `${run.run_type}-${run.id}`;
}

export function isDeletedRun(run: TransformGraphRun): boolean {
  return run.entity_id == null;
}

function dagDependencyCount(run: TransformGraphRun): number | null {
  if (run.run_type !== "dag" || run.transform_count == null) {
    return null;
  }
  const count = run.transform_count - 1; // Doesn't include transform that triggered this DAG run
  return count > 0 ? count : null;
}

function dependenciesText(count: number): string {
  return ngettext(msgid`${count} dependency`, `${count} dependencies`, count);
}

function dependentsText(count: number): string {
  return ngettext(msgid`${count} dependent`, `${count} dependents`, count);
}

export function formatRunName(run: TransformGraphRun): string {
  const name = run.name ?? t`Deleted`;
  const count = dagDependencyCount(run);
  if (count == null) {
    return name;
  }
  return run.direction === "upstream"
    ? `${dependenciesText(count)} › ${name}`
    : `${name} › ${dependentsText(count)}`;
}

function RunEntityName({ run }: { run: TransformGraphRun }) {
  const name = run.name ?? t`Deleted`;
  if (!isDeletedRun(run)) {
    return <Ellipsified fw="bold">{name}</Ellipsified>;
  }
  return (
    <Ellipsified>
      <Tooltip label={t`${name} has been deleted`}>
        <Text c="text-disabled" component="span" display="inline" fs="italic">
          {name}
        </Text>
      </Tooltip>
    </Ellipsified>
  );
}

type RunNameProps = {
  run: TransformGraphRun;
  gap?: MantineSize;
};

export function RunName({ run, gap = "xs" }: RunNameProps) {
  const count = dagDependencyCount(run);
  if (count == null) {
    return <RunEntityName run={run} />;
  }
  const chevron = (
    <Icon
      name="chevronright"
      c="icon-secondary"
      size={8}
      mt="0.15em"
      aria-hidden
    />
  );
  const countText = (
    <Text
      component="span"
      c="text-secondary"
      fz="inherit"
      lh="inherit"
      fw="normal"
      style={{ whiteSpace: "nowrap" }}
    >
      {run.direction === "upstream"
        ? dependenciesText(count)
        : dependentsText(count)}
    </Text>
  );
  return (
    <Flex
      component="span"
      display="inline-flex"
      align="center"
      gap={gap}
      miw={0}
    >
      {run.direction === "upstream" ? (
        <>
          {countText}
          {chevron}
          <RunEntityName run={run} />
        </>
      ) : (
        <>
          <RunEntityName run={run} />
          {chevron}
          {countText}
        </>
      )}
    </Flex>
  );
}

export function formatRunType(run: TransformGraphRun): string {
  return run.run_type === "job" ? t`Job` : t`Transformation`;
}

function getRunColumn(): TreeTableColumnDef<TransformGraphRun> {
  return {
    id: "run",
    header: t`Run`,
    width: 320,
    accessorFn: (run) => formatRunName(run),
    cell: ({ row }) => <RunName run={row.original} />,
  };
}

function getTypeColumn(): TreeTableColumnDef<TransformGraphRun> {
  return {
    id: "type",
    header: t`Type`,
    width: 140,
    accessorFn: (run) => formatRunType(run),
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
      return <Ellipsified>{value}</Ellipsified>;
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
