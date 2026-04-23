import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import {
  Ellipsified,
  FixedSizeIcon,
  Group,
  type TreeTableColumnDef,
} from "metabase/ui";
import type { Database, DatabaseId, QueryExecution } from "metabase-types/api";

import { formatResultRows, formatRunningTime } from "../utils";

type GetColumnsParams = {
  databasesById: Map<DatabaseId, Database>;
};

export function getColumns({
  databasesById,
}: GetColumnsParams): TreeTableColumnDef<QueryExecution>[] {
  return [
    {
      id: "database",
      header: t`Database`,
      width: "auto",
      minWidth: 160,
      enableSorting: true,
      accessorFn: (item) =>
        databasesById.get(item.database_id)?.name ??
        t`Database ${item.database_id}`,
      cell: ({ getValue }) => (
        <Group align="center" gap="sm" miw={0} wrap="nowrap">
          <FixedSizeIcon name="database" />
          <Ellipsified tooltipProps={{ openDelay: 300 }}>
            {String(getValue())}
          </Ellipsified>
        </Group>
      ),
    },
    {
      id: "started_at",
      header: t`Start time`,
      width: "auto",
      minWidth: 160,
      enableSorting: true,
      accessorKey: "started_at",
      cell: ({ row }) => <DateTime value={row.original.started_at} />,
    },
    {
      id: "running_time",
      header: t`Running time`,
      width: "auto",
      minWidth: 120,
      enableSorting: true,
      accessorKey: "running_time",
      cell: ({ row }) => formatRunningTime(row.original.running_time),
    },
    {
      id: "result_rows",
      header: t`Result rows`,
      width: "auto",
      minWidth: 120,
      enableSorting: true,
      accessorKey: "result_rows",
      cell: ({ row }) => formatResultRows(row.original.result_rows),
    },
  ];
}
