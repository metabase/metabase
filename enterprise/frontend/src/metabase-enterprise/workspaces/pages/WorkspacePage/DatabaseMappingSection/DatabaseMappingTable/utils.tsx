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
  isDatabaseProvisioned,
  isDatabaseProvisioning,
  isDatabaseUnprovisioned,
  isDatabaseUnprovisioning,
} from "../../../../utils";

import type { DatabaseMappingRow } from "./types";

export function getRows(
  mappings: WorkspaceDatabase[],
  databasesById: Map<number, Database>,
): DatabaseMappingRow[] {
  return mappings.map((mapping) => ({
    id: mapping.database_id,
    mapping,
    database: databasesById.get(mapping.database_id),
  }));
}

export function getDatabaseColumn(): TreeTableColumnDef<DatabaseMappingRow> {
  return {
    id: "database",
    header: t`Database`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.database?.name ?? `#${row.mapping.database_id}`,
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getSchemasColumn(): TreeTableColumnDef<DatabaseMappingRow> {
  return {
    id: "schemas",
    header: t`Schemas`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.mapping.input_schemas.join(", "),
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getStatusColumn(): TreeTableColumnDef<DatabaseMappingRow> {
  return {
    id: "status",
    header: t`Status`,
    width: "auto",
    minWidth: 240,
    accessorFn: (row) => getStatusLabel(row.mapping),
    cell: ({ row, getValue }) => (
      <Group gap="sm" wrap="nowrap">
        {getStatusIcon(row.original.mapping)}
        <Ellipsified>{String(getValue())}</Ellipsified>
      </Group>
    ),
  };
}

export function getColumns({
  withStatus,
}: {
  withStatus: boolean;
}): TreeTableColumnDef<DatabaseMappingRow>[] {
  return [
    getDatabaseColumn(),
    getSchemasColumn(),
    ...(withStatus ? [getStatusColumn()] : []),
  ];
}

function getStatusLabel(mapping: WorkspaceDatabase): string {
  if (isDatabaseProvisioning(mapping)) {
    return t`Provisioning…`;
  }
  if (isDatabaseUnprovisioning(mapping)) {
    return t`Unprovisioning…`;
  }
  if (isDatabaseProvisioned(mapping)) {
    return t`Provisioned`;
  }
  if (isDatabaseUnprovisioned(mapping)) {
    return t`Not provisioned`;
  }
  return "";
}

function getStatusIcon(mapping: WorkspaceDatabase): ReactNode {
  if (isDatabaseProvisioning(mapping) || isDatabaseUnprovisioning(mapping)) {
    return <Loader size="sm" />;
  }
  if (isDatabaseProvisioned(mapping)) {
    return <Icon name="check_filled" c="success" />;
  }
  return <Icon name="warning" c="warning" />;
}
