import type { ReactNode } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import {
  Ellipsified,
  Group,
  Icon,
  Loader,
  type TreeTableColumnDef,
} from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { Workspace } from "metabase-types/api";

import {
  isDatabaseProvisioned,
  isDatabaseProvisioning,
  isDatabaseUnprovisioned,
  isDatabaseUnprovisioning,
} from "../../../utils";

export function getNameColumn(): TreeTableColumnDef<Workspace> {
  return {
    id: "name",
    accessorKey: "name",
    header: t`Name`,
    width: "auto",
    minWidth: 200,
    accessorFn: (workspace) => workspace.name,
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getStatusColumn(): TreeTableColumnDef<Workspace> {
  return {
    id: "status",
    header: t`Status`,
    width: "auto",
    minWidth: 160,
    accessorFn: (workspace) => getStatusLabel(workspace),
    cell: ({ row, getValue }) => (
      <Group gap="sm" wrap="nowrap">
        {getStatusIcon(row.original)}
        <Ellipsified>{String(getValue())}</Ellipsified>
      </Group>
    ),
  };
}

export function getCreatedByColumn(): TreeTableColumnDef<Workspace> {
  return {
    id: "created_by",
    header: t`Created by`,
    width: "auto",
    minWidth: 160,
    accessorFn: (workspace) =>
      workspace.creator ? getUserName(workspace.creator) : "",
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getCreatedAtColumn(): TreeTableColumnDef<Workspace> {
  return {
    id: "created_at",
    accessorKey: "created_at",
    header: t`Created at`,
    width: "auto",
    minWidth: 160,
    accessorFn: (workspace) => workspace.created_at,
    cell: ({ getValue }) => <DateTime value={String(getValue())} />,
  };
}

export function getColumns(): TreeTableColumnDef<Workspace>[] {
  return [
    getNameColumn(),
    getStatusColumn(),
    getCreatedByColumn(),
    getCreatedAtColumn(),
  ];
}

export function getEmptyLabel(isFiltered: boolean): string {
  return isFiltered
    ? t`No workspaces found`
    : t`Create a workspace to develop transforms in isolation.`;
}

function getStatusLabel(workspace: Workspace): string {
  if (workspace.databases.some(isDatabaseProvisioning)) {
    return t`Provisioning…`;
  }
  if (workspace.databases.some(isDatabaseUnprovisioning)) {
    return t`Unprovisioning…`;
  }
  if (workspace.databases.every(isDatabaseProvisioned)) {
    return t`Provisioned`;
  }
  if (workspace.databases.every(isDatabaseUnprovisioned)) {
    return t`Not provisioned`;
  }
  return t`Partially provisioned`;
}

function getStatusIcon(workspace: Workspace): ReactNode {
  if (workspace.databases.some(isDatabaseProvisioning)) {
    return <Loader size="sm" />;
  }
  if (workspace.databases.some(isDatabaseUnprovisioning)) {
    return <Loader size="sm" />;
  }
  if (workspace.databases.every(isDatabaseProvisioned)) {
    return <Icon name="check_filled" c="success" />;
  }
  return <Icon name="warning" c="warning" />;
}
