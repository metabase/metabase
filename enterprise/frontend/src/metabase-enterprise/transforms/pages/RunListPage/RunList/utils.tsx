import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { TreeTableColumnDef } from "metabase/ui";
import { Text, Tooltip } from "metabase/ui";
import type { TransformRun, TransformTag } from "metabase-types/api";

import { RunStatusInfo } from "../../../components/RunStatusInfo";
import { formatRunMethod, parseTimestampWithTimezone } from "../../../utils";

import { TagList } from "./TagList";

function getTransformColumn(): TreeTableColumnDef<TransformRun> {
  return {
    id: "transform",
    header: t`Transform`,
    enableSorting: false,
    cell: ({ row }) => {
      const run = row.original;
      const isTransformDeleted = run.transform?.deleted === true;
      const transformName = run.transform?.name || t`Unnamed transform`;

      return (
        <Ellipsified>
          {isTransformDeleted ? (
            <Tooltip label={t`${transformName} has been deleted`}>
              <Text
                c="text-tertiary"
                component="span"
                display="inline"
                fs="italic"
              >
                {transformName}
              </Text>
            </Tooltip>
          ) : (
            transformName
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
    enableSorting: false,
    cell: ({ row }) => {
      const run = row.original;
      return (
        <Ellipsified>
          {parseTimestampWithTimezone(run.start_time, systemTimezone).format(
            "lll",
          )}
        </Ellipsified>
      );
    },
  };
}

function getEndedAtColumn(
  systemTimezone: string | undefined,
): TreeTableColumnDef<TransformRun> {
  return {
    id: "ended-at",
    header: t`Ended at`,
    enableSorting: false,
    cell: ({ row }) => {
      const run = row.original;
      return (
        <Ellipsified>
          {run.end_time
            ? parseTimestampWithTimezone(run.end_time, systemTimezone).format(
                "lll",
              )
            : null}
        </Ellipsified>
      );
    },
  };
}

function getStatusColumn(
  systemTimezone: string | undefined,
): TreeTableColumnDef<TransformRun> {
  return {
    id: "status",
    header: t`Status`,
    enableSorting: false,
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
    enableSorting: false,
    cell: ({ row }) => {
      const run = row.original;
      return <Ellipsified>{formatRunMethod(run.run_method)}</Ellipsified>;
    },
  };
}

function getTagsColumn(tags: TransformTag[]): TreeTableColumnDef<TransformRun> {
  return {
    id: "tags",
    header: t`Tags`,
    enableSorting: false,
    cell: ({ row }) => {
      const run = row.original;
      return <TagList tags={tags} tagIds={run.transform?.tag_ids ?? []} />;
    },
  };
}

export function getColumns(
  tags: TransformTag[],
  systemTimezone: string | undefined,
): TreeTableColumnDef<TransformRun>[] {
  return [
    getTransformColumn(),
    getStartedAtColumn(systemTimezone),
    getEndedAtColumn(systemTimezone),
    getStatusColumn(systemTimezone),
    getTriggerColumn(),
    getTagsColumn(tags),
  ];
}
