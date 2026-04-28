import type { ReactNode } from "react";
import { t } from "ttag";

import {
  Ellipsified,
  Group,
  Icon,
  Loader,
  type TreeTableColumnDef,
} from "metabase/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";

import {
  isDatabaseDeprovisioning,
  isDatabaseProvisioned,
  isDatabaseProvisioning,
  isDatabaseUnprovisioned,
} from "../../../../utils";

import type { DatabaseConfigRow } from "./types";

export function getRows(
  configs: WorkspaceDatabase[],
  databasesById: Map<number, Database>,
): DatabaseConfigRow[] {
  return configs.map((config) => ({
    id: config.database_id,
    config,
    database: databasesById.get(config.database_id),
  }));
}

export function getDatabaseColumn(): TreeTableColumnDef<DatabaseConfigRow> {
  return {
    id: "database",
    header: t`Database`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.database?.name ?? `#${row.config.database_id}`,
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getSchemasColumn(): TreeTableColumnDef<DatabaseConfigRow> {
  return {
    id: "schemas",
    header: t`Schemas`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.config.input_schemas.join(", "),
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getStatusColumn(): TreeTableColumnDef<DatabaseConfigRow> {
  return {
    id: "status",
    header: t`Status`,
    width: "auto",
    minWidth: 240,
    accessorFn: (row) => getStatusLabel(row.config),
    cell: ({ row, getValue }) => (
      <Group gap="sm" wrap="nowrap">
        {getStatusIcon(row.original.config)}
        <Ellipsified>{String(getValue())}</Ellipsified>
      </Group>
    ),
  };
}

export function getColumns({
  withStatus,
}: {
  withStatus: boolean;
}): TreeTableColumnDef<DatabaseConfigRow>[] {
  return [
    getDatabaseColumn(),
    getSchemasColumn(),
    ...(withStatus ? [getStatusColumn()] : []),
  ];
}

function getStatusLabel(config: WorkspaceDatabase): string {
  if (isDatabaseProvisioning(config)) {
    return t`Provisioning…`;
  }
  if (isDatabaseDeprovisioning(config)) {
    return t`Deprovisioning…`;
  }
  if (isDatabaseProvisioned(config)) {
    return t`Provisioned`;
  }
  if (isDatabaseUnprovisioned(config)) {
    return t`Not provisioned`;
  }
  return "";
}

function getStatusIcon(config: WorkspaceDatabase): ReactNode {
  if (isDatabaseProvisioning(config) || isDatabaseDeprovisioning(config)) {
    return <Loader size="sm" />;
  }
  if (isDatabaseProvisioned(config)) {
    return <Icon name="check_filled" c="success" />;
  }
  return <Icon name="warning" c="warning" />;
}
