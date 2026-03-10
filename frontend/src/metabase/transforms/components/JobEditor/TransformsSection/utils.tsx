import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { TreeTableColumnDef } from "metabase/ui";
import type { Transform } from "metabase-types/api";

function getTransformColumn(): TreeTableColumnDef<Transform> {
  return {
    id: "transform-name",
    header: t`Transform`,
    width: "auto",
    maxAutoWidth: 520,
    enableSorting: true,
    accessorFn: (transform) => transform.name,
    cell: ({ getValue }) => {
      return <Ellipsified>{String(getValue())}</Ellipsified>;
    },
  };
}

function getTargetColumn(): TreeTableColumnDef<Transform> {
  return {
    id: "target-name",
    header: t`Target`,
    width: "auto",
    maxAutoWidth: 520,
    enableSorting: true,
    accessorFn: (transform) => transform.target.name,
    cell: ({ getValue }) => {
      return <Ellipsified>{String(getValue())}</Ellipsified>;
    },
  };
}

export function getColumns(): TreeTableColumnDef<Transform>[] {
  return [getTransformColumn(), getTargetColumn()];
}
