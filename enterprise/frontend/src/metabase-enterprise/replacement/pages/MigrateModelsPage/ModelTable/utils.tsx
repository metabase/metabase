import { t } from "ttag";

import { ROOT_COLLECTION } from "metabase/entities/collections";
import type { TreeTableColumnDef } from "metabase/ui";
import { Ellipsified, EntityNameCell } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

export function getColumns(): TreeTableColumnDef<SearchResult>[] {
  return [
    {
      id: "name",
      header: t`Name`,
      width: "auto",
      minWidth: 120,
      maxAutoWidth: 520,
      enableSorting: true,
      accessorFn: (result) => result.name,
      cell: ({ getValue }) => (
        <EntityNameCell icon="model" name={String(getValue())} />
      ),
    },
    {
      id: "collection",
      header: t`Collection`,
      width: "auto",
      minWidth: 100,
      maxAutoWidth: 520,
      enableSorting: true,
      accessorFn: (result) => result.collection.name ?? ROOT_COLLECTION.name,
      cell: ({ getValue }) => (
        <Ellipsified tooltipProps={{ openDelay: 300 }}>
          {String(getValue())}
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
      accessorFn: (result) => result.description ?? "",
      cell: ({ getValue }) => (
        <Ellipsified tooltipProps={{ openDelay: 300 }}>
          {String(getValue())}
        </Ellipsified>
      ),
    },
  ];
}

export function getColumnWidths(): number[] {
  return [0.3, 0.3, 0.4];
}
