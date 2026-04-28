import type { Row } from "@tanstack/react-table";
import { useMemo } from "react";

import { TreeTable, useTreeTableInstance } from "metabase/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";

import type { DatabaseConfigRow } from "./types";
import { getColumns, getRows } from "./utils";

type DatabaseConfigTableProps = {
  configs: WorkspaceDatabase[];
  databasesById: Map<number, Database>;
  withStatus: boolean;
  onRowClick: (config: WorkspaceDatabase) => void;
};

export function DatabaseConfigTable({
  configs,
  databasesById,
  withStatus,
  onRowClick,
}: DatabaseConfigTableProps) {
  const rows = useMemo(
    () => getRows(configs, databasesById),
    [configs, databasesById],
  );
  const columns = useMemo(() => getColumns({ withStatus }), [withStatus]);

  const handleRowActivate = (row: Row<DatabaseConfigRow>) => {
    onRowClick(row.original.config);
  };

  const treeTableInstance = useTreeTableInstance<DatabaseConfigRow>({
    data: rows,
    columns,
    getNodeId: (row) => String(row.id),
    onRowActivate: handleRowActivate,
  });

  return (
    <TreeTable instance={treeTableInstance} onRowClick={handleRowActivate} />
  );
}
