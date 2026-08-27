import { t } from "ttag";

import { formatStatus, isErrorStatus } from "metabase/transforms/utils";
import type { TreeTableColumnDef } from "metabase/ui";
import { Box, Ellipsified, Flex, Icon } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { Transform } from "metabase-types/api";

import type { TransformRunByTransformId } from "./types";

function isUnscheduledDependency(transform: Transform) {
  return transform.dependency === true && transform.scheduled === false;
}

function getFreshnessNoteText(transform: Transform): string | null {
  if (!transform.dependency) {
    return null;
  }
  return isUnscheduledDependency(transform)
    ? t`Will not be re-run because it doesn't have a schedule`
    : t`Will only re-run if it is stale according to its own schedule`;
}

function FreshnessNote({ transform }: { transform: Transform }) {
  const note = getFreshnessNoteText(transform);
  if (note == null) {
    return null;
  }
  return (
    <Flex align="center" c="text-secondary" fz="sm" gap="xs" miw={0}>
      {isUnscheduledDependency(transform) && (
        <Icon c="feedback-warning" name="warning" size={12} />
      )}
      <Ellipsified>{note}</Ellipsified>
    </Flex>
  );
}

function getTransformColumn(): TreeTableColumnDef<Transform> {
  return {
    id: "transform-name",
    header: t`Transform`,
    width: "auto",
    maxAutoWidth: 520,
    enableSorting: true,
    accessorFn: (transform) => transform.name,
    cell: ({ getValue }) => {
      return <Ellipsified>{String(getValue())}</Ellipsified>;
    },
  };
}

function getTargetColumn(): TreeTableColumnDef<Transform> {
  return {
    id: "target-name",
    header: t`Target`,
    width: "auto",
    maxAutoWidth: 520,
    enableSorting: true,
    accessorFn: (transform) => transform.target.name,
    cell: ({ getValue }) => {
      return <Ellipsified>{String(getValue())}</Ellipsified>;
    },
  };
}

function getFreshnessNoteColumn(): TreeTableColumnDef<Transform> {
  return {
    id: "freshness-note",
    header: t`Notes`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: getFreshnessNoteText,
    cell: ({ row }) => {
      return <FreshnessNote transform={row.original} />;
    },
  };
}

const getRunStatusColumn = (
  transformRunByTransformId: TransformRunByTransformId,
): TreeTableColumnDef<Transform> => ({
  id: "run-status",
  header: t`Status`,
  width: "auto",
  enableSorting: true,
  accessorFn: ({ id }) => {
    const transformRun = transformRunByTransformId.get(id);
    return transformRun ? formatStatus(transformRun.status) : null;
  },
  cell: ({ row }) => {
    const transformRun = transformRunByTransformId.get(row.original.id);
    if (!transformRun) {
      return EMPTY_CELL_PLACEHOLDER;
    }
    return (
      <Box
        c={isErrorStatus(transformRun.status) ? "feedback-negative" : undefined}
      >
        {formatStatus(transformRun.status)}
      </Box>
    );
  },
});

export function getColumns(
  transformRunByTransformId: TransformRunByTransformId,
): TreeTableColumnDef<Transform>[] {
  return [
    getTransformColumn(),
    getTargetColumn(),
    getRunStatusColumn(transformRunByTransformId),
    getFreshnessNoteColumn(),
  ];
}
