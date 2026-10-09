import { t } from "ttag";

import type { useGetIcon } from "metabase/hooks/use-icon";
import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type { ContentDiagnosticsDuplicatedFinding } from "metabase-types/api";

import { getCommonColumns } from "../common-columns";
import { TOOLTIP_OPEN_DELAY_MS } from "../constants";

export function getColumns(
  getIcon: ReturnType<typeof useGetIcon>,
): TreeTableColumnDef<ContentDiagnosticsDuplicatedFinding>[] {
  const { name, entityType, collectionName, createdBy, createdAt } =
    getCommonColumns<ContentDiagnosticsDuplicatedFinding>(getIcon);
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
        <Ellipsified tooltipProps={{ openDelay: TOOLTIP_OPEN_DELAY_MS }}>
          {row.original.duplicate_count}
        </Ellipsified>
      ),
    };

  return [
    entityType,
    name,
    collectionName,
    duplicateCountColumn,
    createdBy,
    createdAt,
  ];
}

export const SKELETON_COLUMN_WIDTHS = [0.06, 0.34, 0.24, 0.11, 0.13, 0.12];
