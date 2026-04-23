import type { Row } from "@tanstack/react-table";
import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import { TreeTable, useTreeTableInstance } from "metabase/ui";
import type { WorkspaceDatabaseDraft } from "metabase-types/api";

import { type DatabaseMappingRow, getColumns, toMappingRow } from "./utils";

type DatabaseMappingListProps = {
  mappings: WorkspaceDatabaseDraft[];
  onRowClick?: (mapping: WorkspaceDatabaseDraft) => void;
};

export function DatabaseMappingList({
  mappings,
  onRowClick,
}: DatabaseMappingListProps) {
  const { data: databasesResponse } = useListDatabasesQuery();
  const availableDatabases = useMemo(
    () => databasesResponse?.data ?? [],
    [databasesResponse],
  );

  const rows = useMemo(() => mappings.map(toMappingRow), [mappings]);
  const columns = useMemo(
    () => getColumns(availableDatabases),
    [availableDatabases],
  );

  const handleRowActivate = (row: Row<DatabaseMappingRow>) => {
    const { id: _id, ...mapping } = row.original;
    onRowClick?.(mapping);
  };

  const treeTableInstance = useTreeTableInstance<DatabaseMappingRow>({
    data: rows,
    columns,
    getNodeId: (row) => String(row.id),
    onRowActivate: onRowClick ? handleRowActivate : undefined,
  });

  return (
    <TreeTable
      instance={treeTableInstance}
      onRowClick={onRowClick ? handleRowActivate : undefined}
    />
  );
}
