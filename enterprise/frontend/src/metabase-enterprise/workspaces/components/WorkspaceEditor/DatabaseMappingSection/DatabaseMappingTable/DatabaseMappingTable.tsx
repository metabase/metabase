import type { Row } from "@tanstack/react-table";
import { useMemo } from "react";

import { TreeTable, useTreeTableInstance } from "metabase/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";

import type { DatabaseMappingRow } from "./types";
import { getColumns, getRows } from "./utils";

type DatabaseMappingTableProps = {
  mappings: WorkspaceDatabase[];
  databasesById: Map<number, Database>;
  withStatus: boolean;
  onRowClick: (mapping: WorkspaceDatabase) => void;
};

export function DatabaseMappingTable({
  mappings,
  databasesById,
  withStatus,
  onRowClick,
}: DatabaseMappingTableProps) {
  const rows = useMemo(
    () => getRows(mappings, databasesById),
    [mappings, databasesById],
  );
  const columns = useMemo(() => getColumns({ withStatus }), [withStatus]);

  const handleRowActivate = (row: Row<DatabaseMappingRow>) => {
    onRowClick(row.original.mapping);
  };

  const treeTableInstance = useTreeTableInstance<DatabaseMappingRow>({
    data: rows,
    columns,
    getNodeId: (row) => String(row.id),
    onRowActivate: handleRowActivate,
  });

  return (
    <TreeTable instance={treeTableInstance} onRowClick={handleRowActivate} />
  );
}
