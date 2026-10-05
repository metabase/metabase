import { t } from "ttag";

import type { useGetIcon } from "metabase/hooks/use-icon";
import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type {
  ContentDiagnosticsImbalancedFinding,
  ContentDiagnosticsImbalancedFindingType,
} from "metabase-types/api";

import { getCommonColumns } from "../common-columns";
import { TOOLTIP_OPEN_DELAY_MS } from "../constants";

export function getColumns(
  mode: ContentDiagnosticsImbalancedFindingType,
  getIcon: ReturnType<typeof useGetIcon>,
): TreeTableColumnDef<ContentDiagnosticsImbalancedFinding>[] {
  const { name, entityType, collectionName, createdBy, createdAt } =
    getCommonColumns<ContentDiagnosticsImbalancedFinding>(getIcon);
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
    entityType,
    name,
    collectionName,
    contentCountColumn,
    createdBy,
    createdAt,
  ];
}

export const SKELETON_COLUMN_WIDTHS = [0.06, 0.34, 0.24, 0.11, 0.13, 0.12];
