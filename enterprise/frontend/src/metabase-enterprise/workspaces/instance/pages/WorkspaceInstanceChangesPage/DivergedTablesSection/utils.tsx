import { c, t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import {
  Anchor,
  Ellipsified,
  FixedSizeIcon,
  Group,
  Text,
  type TreeTableColumnDef,
} from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type {
  WorkspaceDivergedTable,
  WorkspaceSchemaDrift,
  WorkspaceTableDriftStatus,
  WorkspaceTransformRunStatus,
} from "metabase-types/api";

export function getDivergedTableColumns(): TreeTableColumnDef<WorkspaceDivergedTable>[] {
  return [
    {
      id: "table",
      header: t`Table`,
      width: "auto",
      minWidth: 220,
      maxAutoWidth: 520,
      accessorFn: (row) => `${row.schema}.${row.table_name}`,
      cell: ({ row }) => (
        <Group align="center" gap="sm" miw={0} wrap="nowrap">
          <FixedSizeIcon name="table2" />
          <Ellipsified tooltipProps={{ openDelay: 300 }}>
            {`${row.original.schema}.${row.original.table_name}`}
          </Ellipsified>
        </Group>
      ),
    },
    {
      id: "status",
      header: t`Status`,
      width: "auto",
      minWidth: 120,
      accessorFn: (row) => formatDriftStatus(row.status),
      cell: ({ getValue }) => <Text>{String(getValue())}</Text>,
    },
    {
      id: "produced_by",
      header: t`Produced by`,
      width: "auto",
      minWidth: 200,
      maxAutoWidth: 520,
      accessorFn: (row) => row.produced_by_transform_name ?? "",
      cell: ({ row }) => {
        const transformId = row.original.produced_by_transform_id;
        const name = row.original.produced_by_transform_name;
        if (transformId == null || name == null) {
          return <Text c="text-tertiary">{t`—`}</Text>;
        }
        return (
          <Group align="center" gap="sm" miw={0} wrap="nowrap">
            <FixedSizeIcon name="transform" />
            <Ellipsified tooltipProps={{ openDelay: 300 }}>
              <Anchor component={ForwardRefLink} to={Urls.transform(transformId)}>
                {name}
              </Anchor>
            </Ellipsified>
          </Group>
        );
      },
    },
    {
      id: "last_run",
      header: t`Last run`,
      width: "auto",
      minWidth: 180,
      accessorFn: (row) => row.last_run_at ?? "",
      cell: ({ row }) => (
        <LastRunCell
          lastRunAt={row.original.last_run_at}
          lastRunStatus={row.original.last_run_status}
        />
      ),
    },
    {
      id: "schema_drift",
      header: t`Schema drift`,
      width: "auto",
      minWidth: 200,
      accessorFn: (row) => formatSchemaDrift(row.schema_drift),
      cell: ({ getValue }) => (
        <Text c="text-secondary">{String(getValue())}</Text>
      ),
    },
    {
      id: "affected_items",
      header: t`Affected items`,
      width: "auto",
      minWidth: 140,
      accessorFn: (row) => row.dependents.length,
      cell: ({ row }) => {
        const count = row.original.dependents.length;
        if (count === 0) {
          return <Text c="text-tertiary">{t`—`}</Text>;
        }
        return <Text>{count}</Text>;
      },
    },
  ];
}

type LastRunCellProps = {
  lastRunAt: string | null;
  lastRunStatus: WorkspaceTransformRunStatus;
};

function LastRunCell({ lastRunAt, lastRunStatus }: LastRunCellProps) {
  if (lastRunAt == null) {
    return <Text c="text-tertiary">{formatRunStatus(lastRunStatus)}</Text>;
  }
  return <DateTime value={lastRunAt} />;
}

function formatDriftStatus(status: WorkspaceTableDriftStatus): string {
  switch (status) {
    case "new":
      return t`New`;
    case "modified":
      return t`Modified`;
    case "deleted":
      return t`Deleted`;
  }
}

function formatRunStatus(status: WorkspaceTransformRunStatus): string {
  switch (status) {
    case "succeeded":
      return t`Succeeded`;
    case "failed":
      return t`Failed`;
    case "running":
      return t`Running`;
    case "never_run":
      return t`Never run`;
  }
}

function formatSchemaDrift(drift: WorkspaceSchemaDrift): string {
  const parts: string[] = [];
  if (drift.added_columns.length > 0) {
    parts.push(
      c("count of added columns").t`+${drift.added_columns.length} added`,
    );
  }
  if (drift.removed_columns.length > 0) {
    parts.push(
      c("count of removed columns")
        .t`-${drift.removed_columns.length} removed`,
    );
  }
  if (drift.type_changed_columns.length > 0) {
    parts.push(
      c("count of columns whose type changed")
        .t`${drift.type_changed_columns.length} type changed`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : t`No schema drift`;
}
