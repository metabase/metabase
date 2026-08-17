import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified, Text, type TreeTableColumnDef } from "metabase/ui";
import type { ContentDiagnosticsStaleFinding } from "metabase-types/api";

import { getCommonColumns } from "../common-columns";

export function getColumns(): TreeTableColumnDef<ContentDiagnosticsStaleFinding>[] {
  const { name, entityType, collection, createdBy, createdAt } =
    getCommonColumns<ContentDiagnosticsStaleFinding>();
  const lastActiveAt: TreeTableColumnDef<ContentDiagnosticsStaleFinding> = {
    id: "last-active-at",
    header: t`Last active`,
    enableSorting: true,
    sortDescFirst: false,
    width: "auto",
    minWidth: 150,
    accessorFn: (finding) => finding.last_active_at,
    cell: ({ row }) => {
      const { last_active_at } = row.original;
      if (last_active_at == null) {
        return <Text c="text-secondary">{t`Never`}</Text>;
      }
      return (
        <Ellipsified tooltipProps={{ openDelay: 300 }}>
          <DateTime value={last_active_at} unit="day" />
        </Ellipsified>
      );
    },
  };

  return [name, entityType, collection, createdBy, createdAt, lastActiveAt];
}

export const SKELETON_COLUMN_WIDTHS = [0.28, 0.12, 0.24, 0.13, 0.12, 0.11];
