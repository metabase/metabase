import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { Workspace } from "metabase-types/api";

function getWorkspaceDatabaseNames(workspace: Workspace): string[] {
  return workspace.databases
    .map((workspaceDatabase) => workspaceDatabase.database?.name)
    .filter((name) => name != null);
}

export function getColumns(): TreeTableColumnDef<Workspace>[] {
  return [
    {
      id: "name",
      header: t`Name`,
      width: "auto",
      minWidth: 160,
      maxAutoWidth: 360,
      enableSorting: true,
      accessorFn: (workspace) => workspace.name,
      cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
    },
    {
      id: "databases",
      header: t`Databases`,
      width: "auto",
      minWidth: 160,
      maxAutoWidth: 360,
      enableSorting: true,
      accessorFn: (workspace) =>
        getWorkspaceDatabaseNames(workspace).join(", "),
      cell: ({ getValue }) => <Ellipsified>{getValue<string>()}</Ellipsified>,
    },
    {
      id: "created_by",
      header: t`Created by`,
      width: "auto",
      minWidth: 140,
      maxAutoWidth: 240,
      enableSorting: true,
      accessorFn: (workspace) => getUserName(workspace.creator) ?? "",
      cell: ({ getValue }) => <Ellipsified>{getValue<string>()}</Ellipsified>,
    },
    {
      id: "created_at",
      header: t`Created at`,
      width: "auto",
      minWidth: 140,
      enableSorting: true,
      accessorFn: (workspace) => workspace.created_at,
      cell: ({ row }) => (
        <DateTime value={row.original.created_at} unit="day" />
      ),
    },
  ];
}
