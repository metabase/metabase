import { t } from "ttag";

import type { useGetIcon } from "metabase/hooks/use-icon";
import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import { formatDurationLong } from "metabase/utils/formatting";
import type { ContentDiagnosticsSlowFinding } from "metabase-types/api";

import { getCommonColumns } from "../common-columns";
import { TOOLTIP_OPEN_DELAY_MS } from "../constants";

export function getColumns(
  getIcon: ReturnType<typeof useGetIcon>,
): TreeTableColumnDef<ContentDiagnosticsSlowFinding>[] {
  const { name, entityType, collectionName, createdBy, createdAt } =
    getCommonColumns<ContentDiagnosticsSlowFinding>(getIcon);
  const duration: TreeTableColumnDef<ContentDiagnosticsSlowFinding> = {
    id: "duration-ms",
    header: t`Duration`,
    enableSorting: true,
    sortDescFirst: false,
    width: "auto",
    minWidth: 120,
    accessorFn: (finding) => finding.duration_ms,
    cell: ({ row }) => (
      <Ellipsified tooltipProps={{ openDelay: TOOLTIP_OPEN_DELAY_MS }}>
        {formatDurationLong(row.original.duration_ms)}
      </Ellipsified>
    ),
  };

  return [entityType, name, collectionName, createdBy, createdAt, duration];
}

export const SKELETON_COLUMN_WIDTHS = [0.06, 0.34, 0.24, 0.13, 0.12, 0.11];
