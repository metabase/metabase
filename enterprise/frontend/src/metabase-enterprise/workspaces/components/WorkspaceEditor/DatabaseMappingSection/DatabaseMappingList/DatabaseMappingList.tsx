import type { Row } from "@tanstack/react-table";
import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import { TreeTable, useTreeTableInstance } from "metabase/ui";
import type { WorkspaceDatabaseDraft } from "metabase-types/api";

import type { WorkspaceDatabaseRow } from "./types";
import { getColumns, getRows } from "./utils";

type DatabaseMappingListProps = {
  mappings: WorkspaceDatabaseDraft[];
  onRowClick?: (mapping: WorkspaceDatabaseDraft) => void;
};

export function DatabaseMappingList({
  mappings,
  onRowClick,
}: DatabaseMappingListProps) {
  const { data: databasesResponse } = useListDatabasesQuery();
  const databases = useMemo(
    () => databasesResponse?.data ?? [],
    [databasesResponse],
  );

  const rows = useMemo(
    () => getRows(mappings, databases),
    [mappings, databases],
  );
  const columns = useMemo(() => getColumns(), []);

  const handleRowActivate = (row: Row<WorkspaceDatabaseRow>) => {
    onRowClick?.(row.original.mapping);
  };

  const treeTableInstance = useTreeTableInstance<WorkspaceDatabaseRow>({
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
