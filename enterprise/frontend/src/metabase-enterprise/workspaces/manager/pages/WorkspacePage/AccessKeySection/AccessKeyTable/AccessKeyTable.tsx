import type { Row } from "@tanstack/react-table";
import { useMemo } from "react";
import { t } from "ttag";

import { Text, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { WorkspaceAccessKey } from "metabase-types/api";

import { getColumns } from "./utils";

type AccessKeyTableProps = {
  accessKeys: WorkspaceAccessKey[];
  onEdit: (accessKey: WorkspaceAccessKey) => void;
  onDelete: (accessKey: WorkspaceAccessKey) => void;
};

export function AccessKeyTable({
  accessKeys,
  onEdit,
  onDelete,
}: AccessKeyTableProps) {
  const columns = useMemo(
    () => getColumns(onEdit, onDelete),
    [onEdit, onDelete],
  );

  const instance = useTreeTableInstance<WorkspaceAccessKey>({
    data: accessKeys,
    columns,
    getNodeId: (row) => String(row.id),
  });

  const handleRowClick = (row: Row<WorkspaceAccessKey>) => {
    onEdit(row.original);
  };

  return (
    <TreeTable
      instance={instance}
      onRowClick={handleRowClick}
      emptyState={<Text c="text-secondary">{t`No access keys yet.`}</Text>}
    />
  );
}
