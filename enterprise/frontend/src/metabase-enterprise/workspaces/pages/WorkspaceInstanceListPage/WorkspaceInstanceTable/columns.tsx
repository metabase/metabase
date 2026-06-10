import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type { WorkspaceInstance } from "metabase-types/api";

export function getInstanceStatusLabel(instance: WorkspaceInstance): string {
  return instance.workspace_id != null ? t`In use` : t`Available`;
}

export function getColumns(): TreeTableColumnDef<WorkspaceInstance>[] {
  return [
    {
      id: "name",
      header: t`Name`,
      width: "auto",
      minWidth: 160,
      maxAutoWidth: 320,
      enableSorting: true,
      accessorFn: (instance) => instance.name,
      cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
    },
    {
      id: "url",
      header: t`URL`,
      width: "auto",
      minWidth: 200,
      maxAutoWidth: 420,
      enableSorting: true,
      accessorFn: (instance) => instance.url,
      cell: ({ row }) => <Ellipsified>{row.original.url}</Ellipsified>,
    },
    {
      id: "status",
      header: t`Status`,
      width: "auto",
      minWidth: 120,
      enableSorting: true,
      accessorFn: (instance) => getInstanceStatusLabel(instance),
      cell: ({ getValue }) => getValue<string>(),
    },
    {
      id: "created_at",
      header: t`Created at`,
      width: "auto",
      minWidth: 140,
      enableSorting: true,
      accessorFn: (instance) => instance.created_at,
      cell: ({ row }) => (
        <DateTime value={row.original.created_at} unit="day" />
      ),
    },
  ];
}
