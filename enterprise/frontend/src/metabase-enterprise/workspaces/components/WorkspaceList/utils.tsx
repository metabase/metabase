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
    cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
  };
}

export function getCreatedAtColumn(): TreeTableColumnDef<Workspace> {
  return {
    id: "created_at",
    accessorKey: "created_at",
    header: t`Created at`,
    width: "auto",
    minWidth: 160,
    cell: ({ row }) => <DateTime value={row.original.created_at} />,
  };
}

export function getColumns(): TreeTableColumnDef<Workspace>[] {
  return [getNameColumn(), getCreatedAtColumn()];
}

export const COLUMN_WIDTHS = [0.7, 0.3];
