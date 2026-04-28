import { t } from "ttag";

import {
  Ellipsified,
  FixedSizeIcon,
  Group,
  type TreeTableColumnDef,
} from "metabase/ui";

import type { WorkspaceOverviewDatabaseRow } from "../types";

export function getOverviewColumns(): TreeTableColumnDef<WorkspaceOverviewDatabaseRow>[] {
  return [
    {
      id: "database",
      header: t`Database`,
      width: "auto",
      minWidth: 200,
      accessorFn: (row) => row.database?.name ?? row.config.name,
      cell: ({ row }) => (
        <Group align="center" gap="sm" miw={0} wrap="nowrap">
          <FixedSizeIcon name="database" />
          <Ellipsified tooltipProps={{ openDelay: 300 }}>
            {row.original.database?.name ?? row.original.config.name}
          </Ellipsified>
        </Group>
      ),
    },
    {
      id: "input_schemas",
      header: t`Readable schemas`,
      width: "auto",
      minWidth: 200,
      accessorFn: (row) => row.config.input_schemas.join(", "),
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
    {
      id: "output_schema",
      header: t`Isolation schema`,
      width: "auto",
      minWidth: 200,
      accessorFn: (row) => row.config.output_schema,
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
  ];
}
