import { t } from "ttag";

import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type { ContentDiagnosticsDuplicatedFinding } from "metabase-types/api";

import { getCommonColumns } from "../common-columns";

export function getColumns(): TreeTableColumnDef<ContentDiagnosticsDuplicatedFinding>[] {
  return [
    ...getCommonColumns<ContentDiagnosticsDuplicatedFinding>(),
    {
      id: "duplicate-count",
      header: t`Duplicates`,
      enableSorting: true,
      sortDescFirst: false,
      width: "auto",
      minWidth: 120,
      accessorFn: (finding) => finding.duplicate_count,
      cell: ({ row }) => (
        <Ellipsified tooltipProps={{ openDelay: 300 }}>
          {row.original.duplicate_count}
        </Ellipsified>
      ),
    },
  ];
}

export const SKELETON_COLUMN_WIDTHS = [0.28, 0.12, 0.24, 0.13, 0.12, 0.11];
