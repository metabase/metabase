import { t } from "ttag";

import type { TreeTableColumnDef } from "metabase/ui";
import { Ellipsified } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";

function getNameColumn(): TreeTableColumnDef<CollectionItem> {
  return {
    id: "name",
    accessorKey: "name",
    header: t`Name`,
    minWidth: 200,
    cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
  };
}

export function getColumns(): TreeTableColumnDef<CollectionItem>[] {
  return [getNameColumn()];
}
