import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { Workspace, WorkspaceDatabaseStatus } from "metabase-types/api";

import {
  isDatabaseProvisioned,
  isDatabaseProvisioning,
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
    accessorFn: (workspace) => getWorkspaceStatus(workspace),
    cell: ({ getValue }) => (
      <Ellipsified>
        {getStatusLabel(getValue() as WorkspaceDatabaseStatus)}
      </Ellipsified>
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

export const COLUMN_WIDTHS = [0.4, 0.2, 0.2, 0.2];

function getWorkspaceStatus(workspace: Workspace): WorkspaceDatabaseStatus {
  if (workspace.databases.some(isDatabaseProvisioning)) {
    return "provisioning";
  }
  if (workspace.databases.some(isDatabaseUnprovisioning)) {
    return "unprovisioning";
  }
  if (workspace.databases.every(isDatabaseProvisioned)) {
    return "provisioned";
  }
  return "unprovisioned";
}

function getStatusLabel(status: WorkspaceDatabaseStatus): string {
  switch (status) {
    case "provisioned":
      return t`Provisioned`;
    case "provisioning":
      return t`Provisioning`;
    case "unprovisioning":
      return t`Unprovisioning`;
    case "unprovisioned":
      return t`Unprovisioned`;
  }
}
