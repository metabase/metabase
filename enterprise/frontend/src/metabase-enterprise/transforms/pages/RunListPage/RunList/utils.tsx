import type { SortingState } from "@tanstack/react-table";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { TreeTableColumnDef } from "metabase/ui";
import { Group, SortableHeaderPill, Text, Tooltip } from "metabase/ui";
import {
  TRANSFORM_RUN_SORT_COLUMNS,
  type TransformRun,
  type TransformRunSortColumn,
  type TransformTag,
  type TransformTagId,
} from "metabase-types/api";

import { RunStatusInfo } from "../../../components/RunStatusInfo";
import {
  formatRunMethod,
  formatStatus,
  parseTimestampWithTimezone,
} from "../../../utils";
import type { TransformRunSortOptions } from "../types";

import { TagList } from "./TagList";
import { TimezoneIndicator } from "./TimezoneIndicator";

function getTransformColumn(): TreeTableColumnDef<TransformRun> {
  return {
    id: "transform-name",
    header: t`Transform`,
    width: "auto",
    maxAutoWidth: 520,
    enableSorting: false,
    accessorFn: (run) => {
      return run.transform?.name || t`Unnamed transform`;
    },
    cell: ({ row, getValue }) => {
      const run = row.original;
      const value = String(getValue());
      const isTransformDeleted = run.transform?.deleted === true;

      return (
        <Ellipsified>
          {isTransformDeleted ? (
            <Tooltip label={t`${value} has been deleted`}>
              <Text
                c="text-tertiary"
                component="span"
                display="inline"
                fs="italic"
              >
                {value}
              </Text>
            </Tooltip>
          ) : (
            value
          )}
        </Ellipsified>
      );
    },
  };
}

function getStartedAtColumn(
  systemTimezone: string | undefined,
): TreeTableColumnDef<TransformRun> {
  return {
    id: "start-time" satisfies TransformRunSortColumn,
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
    accessorFn: (run) => {
      return parseTimestampWithTimezone(run.start_time, systemTimezone).format(
        "lll",
      );
    },
    cell: ({ getValue }) => {
      const value = getValue();
      return <Ellipsified>{String(value)}</Ellipsified>;
    },
  };
}

function getEndedAtColumn(
  systemTimezone: string | undefined,
): TreeTableColumnDef<TransformRun> {
  return {
    id: "end-time" satisfies TransformRunSortColumn,
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
    accessorFn: (run) => {
      return run.end_time != null
        ? parseTimestampWithTimezone(run.end_time, systemTimezone).format("lll")
        : null;
    },
    cell: ({ getValue }) => {
      const value = getValue();
      return value != null ? <Ellipsified>{String(value)}</Ellipsified> : null;
    },
  };
}

function getStatusColumn(
  systemTimezone: string | undefined,
): TreeTableColumnDef<TransformRun> {
  return {
    id: "status",
    header: t`Status`,
    width: 100,
    enableSorting: false,
    accessorFn: (row) => formatStatus(row.status),
    cell: ({ row }) => {
      const run = row.original;
      return (
        <RunStatusInfo
          transform={run.transform}
          status={run.status}
          message={run.message}
          endTime={
            run.end_time != null
              ? parseTimestampWithTimezone(
                  run.end_time,
                  systemTimezone,
                ).toDate()
              : null
          }
        />
      );
    },
  };
}

function getRunMethodColumn(): TreeTableColumnDef<TransformRun> {
  return {
    id: "run-method",
    header: t`Trigger`,
    width: "auto",
    enableSorting: false,
    accessorFn: (row) => formatRunMethod(row.run_method),
    cell: ({ getValue }) => {
      const value = String(getValue());
      return <Ellipsified>{value}</Ellipsified>;
    },
  };
}

function getTagById(
  tags: TransformTag[],
): Record<TransformTagId, TransformTag> {
  return Object.fromEntries(tags.map((tag) => [tag.id, tag]));
}

function getTagList(
  tagIds: TransformTagId[],
  tagById: Record<TransformTagId, TransformTag>,
) {
  return tagIds.map((tagId) => tagById[tagId]).filter((tag) => tag != null);
}

function getTagsLabel(tags: TransformTag[]) {
  return tags.map((tag) => tag.name).join(", ");
}

function getTransformTagsColumn(
  tagsById: Record<TransformTagId, TransformTag>,
): TreeTableColumnDef<TransformRun> {
  return {
    id: "transform-tags",
    header: t`Tags`,
    width: "auto",
    enableSorting: false,
    accessorFn: (row) =>
      getTagsLabel(getTagList(row.transform?.tag_ids ?? [], tagsById)),
    cell: ({ row }) => {
      const run = row.original;
      const tags = getTagList(run.transform?.tag_ids ?? [], tagsById);
      return <TagList tags={tags} />;
    },
  };
}

export function getColumns(
  tags: TransformTag[],
  systemTimezone: string | undefined,
): TreeTableColumnDef<TransformRun>[] {
  const tagsById = getTagById(tags);

  return [
    getTransformColumn(),
    getStartedAtColumn(systemTimezone),
    getEndedAtColumn(systemTimezone),
    getStatusColumn(systemTimezone),
    getRunMethodColumn(),
    getTransformTagsColumn(tagsById),
  ];
}

export function getSortingState(
  sortOptions: TransformRunSortOptions | undefined,
): SortingState {
  return sortOptions != null
    ? [{ id: sortOptions.column, desc: sortOptions.direction === "desc" }]
    : [];
}

export function getSortingOptions(
  sortingState: SortingState,
): TransformRunSortOptions | undefined {
  if (sortingState.length === 0) {
    return undefined;
  }

  const { id, desc } = sortingState[0];
  const column = TRANSFORM_RUN_SORT_COLUMNS.find((column) => column === id);
  if (column == null) {
    return undefined;
  }

  return { column, direction: desc ? "desc" : "asc" };
}
