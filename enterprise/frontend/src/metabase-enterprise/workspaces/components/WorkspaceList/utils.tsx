import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
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
  return [getNameColumn(), getCreatedAtColumn()];
}

export const COLUMN_WIDTHS = [0.7, 0.3];
