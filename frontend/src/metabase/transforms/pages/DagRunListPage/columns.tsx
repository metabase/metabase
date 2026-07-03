import { t } from "ttag";

import type { TreeTableColumnDef } from "metabase/ui";
import { Ellipsified } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type {
  TransformDagDirection,
  TransformDagRun,
} from "metabase-types/api";

function formatDirection(direction: TransformDagDirection | null): string {
  if (direction === "upstream") {
    return t`Upstream`;
  }
  if (direction === "downstream") {
    return t`Downstream`;
  }
  return EMPTY_CELL_PLACEHOLDER;
}

export function getDagRunLeadingColumns(): TreeTableColumnDef<TransformDagRun>[] {
  return [
    {
      id: "transform",
      header: t`Transform`,
      minWidth: 160,
      accessorFn: (run) => run.transform_name ?? "",
      cell: ({ row }) => (
        <Ellipsified>
          {row.original.transform_name ?? EMPTY_CELL_PLACEHOLDER}
        </Ellipsified>
      ),
    },
    {
      id: "direction",
      header: t`Scope`,
      width: 140,
      accessorFn: (run) => formatDirection(run.direction),
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
  ];
}
