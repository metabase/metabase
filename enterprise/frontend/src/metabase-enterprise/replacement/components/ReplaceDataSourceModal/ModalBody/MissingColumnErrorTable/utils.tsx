import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { TreeTableColumnDef } from "metabase/ui";
import type { MissingColumnReplaceSourceError } from "metabase-types/api";

import type { MissingColumnReplaceSourceErrorItem } from "./types";

export function getRows(
  errors: MissingColumnReplaceSourceError[],
): MissingColumnReplaceSourceErrorItem[] {
  return errors.map((error) => ({
    ...error,
    id: error.name,
  }));
}

export function getColumns(): TreeTableColumnDef<MissingColumnReplaceSourceErrorItem>[] {
  return [
    {
      id: "name",
      header: t`Field`,
      width: "auto",
      maxAutoWidth: 520,
      accessorFn: (error) => error.name,
      cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
    },
    {
      id: "database_type",
      header: t`Field type`,
      width: "auto",
      maxAutoWidth: 520,
      accessorFn: (error) => error.database_type,
      cell: ({ row }) => (
        <Ellipsified>{row.original.database_type}</Ellipsified>
      ),
    },
  ];
}
