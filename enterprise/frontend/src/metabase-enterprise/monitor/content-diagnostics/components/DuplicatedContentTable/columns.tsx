import { t } from "ttag";

import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type { ContentDiagnosticsDuplicatedFinding } from "metabase-types/api";

import { getCommonColumns } from "../common-columns";

export function getColumns(): TreeTableColumnDef<ContentDiagnosticsDuplicatedFinding>[] {
  const commonColumns = getCommonColumns<ContentDiagnosticsDuplicatedFinding>();
  const duplicateCountColumn: TreeTableColumnDef<ContentDiagnosticsDuplicatedFinding> =
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
    };

  const collectionIndex = commonColumns.findIndex(
    (column) => column.id === "collection",
  );
  return [
    ...commonColumns.slice(0, collectionIndex + 1),
    duplicateCountColumn,
    ...commonColumns.slice(collectionIndex + 1),
  ];
}

export const SKELETON_COLUMN_WIDTHS = [0.28, 0.12, 0.24, 0.11, 0.13, 0.12];
