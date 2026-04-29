import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import type { TreeTableColumnDef } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { Workspace } from "metabase-types/api";

export function getNameColumn(): TreeTableColumnDef<Workspace> {
  return {
    id: "name",
    accessorKey: "name",
    header: t`Name`,
    width: "auto",
    minWidth: 200,
    accessorFn: (workspace) => workspace.name,
    cell: ({ getValue }) => String(getValue()),
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
    cell: ({ getValue }) => String(getValue()),
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
  return [getNameColumn(), getCreatedByColumn(), getCreatedAtColumn()];
}

export function getEmptyLabel(isFiltered: boolean): string {
  return isFiltered ? t`No workspaces found` : t`No workspaces yet`;
}
