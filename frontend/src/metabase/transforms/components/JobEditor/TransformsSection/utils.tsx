import { t } from "ttag";

import type { TreeTableColumnDef } from "metabase/ui";
import { Ellipsified, Flex, Icon, Text } from "metabase/ui";
import type { Transform } from "metabase-types/api";

export function isUnscheduledDependency(transform: Transform) {
  return transform.dependency === true && transform.scheduled === false;
}

function FreshnessNote({ transform }: { transform: Transform }) {
  if (!transform.dependency) {
    return null;
  }
  if (isUnscheduledDependency(transform)) {
    return (
      <Flex align="center" c="warning" flex="0 0 auto" gap="xs">
        <Icon name="warning" size={12} />
        <Text c="warning" size="sm">
          {t`Will not be re-run because it doesn't have a schedule`}
        </Text>
      </Flex>
    );
  }
  return (
    <Text c="text-secondary" flex="0 0 auto" size="sm">
      {t`Will only re-run if it is stale according to its own schedule`}
    </Text>
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
    cell: ({ getValue, row }) => {
      return (
        <Flex align="center" gap="sm" miw={0}>
          <Ellipsified>{String(getValue())}</Ellipsified>
          <FreshnessNote transform={row.original} />
        </Flex>
      );
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

export function getColumns(): TreeTableColumnDef<Transform>[] {
  return [getTransformColumn(), getTargetColumn()];
}
