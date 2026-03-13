import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import type { TreeTableColumnDef } from "metabase/ui";
import { EntityNameCell } from "metabase/ui";
import type { Card } from "metabase-types/api";

export function getColumns(): TreeTableColumnDef<Card>[] {
  return [
    {
      id: "name",
      header: t`Name`,
      width: "auto",
      minWidth: 120,
      maxAutoWidth: 520,
      enableSorting: true,
      accessorFn: (card) => card.name,
      cell: ({ row }) => (
        <EntityNameCell icon="model" name={row.original.name} />
      ),
    },
    {
      id: "collection",
      header: t`Collection`,
      width: "auto",
      minWidth: 100,
      maxAutoWidth: 520,
      enableSorting: true,
      accessorFn: (card) => card.collection?.name ?? ROOT_COLLECTION.name,
      cell: ({ row }) => (
        <Ellipsified tooltipProps={{ openDelay: 300 }}>
          {row.original.collection?.name ?? ROOT_COLLECTION.name}
        </Ellipsified>
      ),
    },
    {
      id: "description",
      header: t`Description`,
      width: "auto",
      minWidth: 100,
      maxAutoWidth: 520,
      enableSorting: true,
      accessorFn: (card) => card.description ?? "",
      cell: ({ row }) => (
        <Ellipsified tooltipProps={{ openDelay: 300 }}>
          {row.original.description ?? ""}
        </Ellipsified>
      ),
    },
  ];
}

export function getColumnWidths(): number[] {
  return [0.3, 0.3, 0.4];
}
