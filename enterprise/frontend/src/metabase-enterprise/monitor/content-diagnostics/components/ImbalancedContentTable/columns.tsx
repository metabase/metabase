import { t } from "ttag";

import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type {
  ContentDiagnosticsImbalancedFinding,
  ContentDiagnosticsImbalancedFindingType,
} from "metabase-types/api";

import { getCommonColumns } from "../common-columns";
import { TOOLTIP_OPEN_DELAY_MS } from "../constants";

export function getColumns(
  mode: ContentDiagnosticsImbalancedFindingType,
): TreeTableColumnDef<ContentDiagnosticsImbalancedFinding>[] {
  const { name, entityType, collectionName, createdBy, createdAt } =
    getCommonColumns<ContentDiagnosticsImbalancedFinding>();
  const contentCountColumn: TreeTableColumnDef<ContentDiagnosticsImbalancedFinding> =
    {
      id: "content-count",
      header: t`Content count`,
      enableSorting: mode !== "crowded",
      sortDescFirst: false,
      width: "auto",
      minWidth: 120,
      accessorFn: (finding) => finding.content_count,
      cell: ({ row }) => (
        <Ellipsified tooltipProps={{ openDelay: TOOLTIP_OPEN_DELAY_MS }}>
          {row.original.content_count}
        </Ellipsified>
      ),
    };

  return [
    name,
    entityType,
    collectionName,
    contentCountColumn,
    createdBy,
    createdAt,
  ];
}

export const SKELETON_COLUMN_WIDTHS = [0.28, 0.12, 0.24, 0.11, 0.13, 0.12];
