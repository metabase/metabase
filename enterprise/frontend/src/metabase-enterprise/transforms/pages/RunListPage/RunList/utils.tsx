import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { TreeTableColumnDef } from "metabase/ui";
import { Text, Tooltip } from "metabase/ui";
import type {
  TransformRun,
  TransformTag,
  TransformTagId,
} from "metabase-types/api";

import { RunStatusInfo } from "../../../components/RunStatusInfo";
import {
  formatRunMethod,
  formatStatus,
  parseTimestampWithTimezone,
} from "../../../utils";

import { TagList } from "./TagList";

function getTransformColumn(): TreeTableColumnDef<TransformRun> {
  return {
    id: "transform",
    header: t`Transform`,
    minWidth: 320,
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
    id: "started-at",
    header: t`Started at`,
    width: "auto",
    enableSorting: false,
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
    id: "ended-at",
    header: t`Ended at`,
    width: "auto",
    enableSorting: false,
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

function getTriggerColumn(): TreeTableColumnDef<TransformRun> {
  return {
    id: "trigger",
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

function getTagsColumn(
  tagsById: Record<TransformTagId, TransformTag>,
): TreeTableColumnDef<TransformRun> {
  return {
    id: "tags",
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
    getTriggerColumn(),
    getTagsColumn(tagsById),
  ];
}
