import { t } from "ttag";

import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type { ContentDiagnosticsImbalancedFinding } from "metabase-types/api";

import { getCommonColumns } from "../common-columns";

export function getColumns(): TreeTableColumnDef<ContentDiagnosticsImbalancedFinding>[] {
  const { name, entityType, collection, createdBy, createdAt } =
    getCommonColumns<ContentDiagnosticsImbalancedFinding>();
  const contentCountColumn: TreeTableColumnDef<ContentDiagnosticsImbalancedFinding> =
    {
      id: "content-count",
      header: t`Content count`,
      enableSorting: true,
      sortDescFirst: false,
      width: "auto",
      minWidth: 120,
      accessorFn: (finding) => finding.content_count,
      cell: ({ row }) => (
        <Ellipsified tooltipProps={{ openDelay: 300 }}>
          {row.original.content_count}
        </Ellipsified>
      ),
    };

  return [
    name,
    entityType,
    collection,
    contentCountColumn,
    createdBy,
    createdAt,
  ];
}

export const SKELETON_COLUMN_WIDTHS = [0.28, 0.12, 0.24, 0.11, 0.13, 0.12];
