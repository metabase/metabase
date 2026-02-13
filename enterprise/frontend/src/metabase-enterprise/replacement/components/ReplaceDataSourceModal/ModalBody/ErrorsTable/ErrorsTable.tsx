import { useMemo } from "react";
import { t } from "ttag";

import type { TreeTableColumnDef } from "metabase/ui";
import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type {
  ReplaceSourceColumnInfo,
  ReplaceSourceError,
} from "metabase-types/api";

import { ColumnNameCell } from "./ColumnNameCell";

type ErrorsTableProps = {
  error: ReplaceSourceError;
};

type ErrorItem = {
  id: string;
  column: ReplaceSourceColumnInfo;
};

function getRows(columns: ReplaceSourceColumnInfo[]): ErrorItem[] {
  return columns.map((column) => ({
    id: column.name,
    column,
  }));
}

function getColumns(): TreeTableColumnDef<ErrorItem>[] {
  return [
    {
      id: "name",
      header: t`Field`,
      width: "auto",
      maxAutoWidth: 520,
      accessorFn: (item) => item.column.display_name,
      cell: ({ row }) => <ColumnNameCell column={row.original.column} />,
    },
  ];
}

export function ErrorsTable({ error }: ErrorsTableProps) {
  const rows = useMemo(() => getRows(error.columns), [error.columns]);
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance = useTreeTableInstance<ErrorItem>({
    data: rows,
    columns,
    getNodeId: (item) => item.id,
  });

  return (
    <Card p={0} shadow="none" withBorder>
      <TreeTable instance={treeTableInstance} />
    </Card>
  );
}
