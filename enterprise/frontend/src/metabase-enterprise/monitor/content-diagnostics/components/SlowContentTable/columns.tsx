import { t } from "ttag";

import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import { formatDurationLong } from "metabase/utils/formatting";
import type { ContentDiagnosticsSlowFinding } from "metabase-types/api";

import { getCommonColumns } from "../common-columns";

export function getColumns(): TreeTableColumnDef<ContentDiagnosticsSlowFinding>[] {
  const { name, entityType, collection, createdBy, createdAt } =
    getCommonColumns<ContentDiagnosticsSlowFinding>();
  const duration: TreeTableColumnDef<ContentDiagnosticsSlowFinding> = {
    id: "duration-ms",
    header: t`Duration`,
    enableSorting: true,
    sortDescFirst: false,
    width: "auto",
    minWidth: 120,
    accessorFn: (finding) => finding.duration_ms,
    cell: ({ row }) => (
      <Ellipsified tooltipProps={{ openDelay: 300 }}>
        {formatDurationLong(row.original.duration_ms)}
      </Ellipsified>
    ),
  };

  return [name, entityType, collection, createdBy, createdAt, duration];
}

export const SKELETON_COLUMN_WIDTHS = [0.28, 0.12, 0.24, 0.13, 0.12, 0.11];
