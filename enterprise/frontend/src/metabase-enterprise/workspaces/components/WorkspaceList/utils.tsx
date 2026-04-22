import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
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
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
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
  return [getNameColumn(), getCreatedByColumn(), getCreatedAtColumn()];
}

export const COLUMN_WIDTHS = [0.5, 0.25, 0.25];
