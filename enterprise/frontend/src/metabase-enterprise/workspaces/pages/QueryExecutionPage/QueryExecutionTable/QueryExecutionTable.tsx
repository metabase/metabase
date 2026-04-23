import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import CS from "metabase/css/core/index.css";
import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type {
  Database,
  DatabaseId,
  QueryExecution,
  QueryExecutionId,
} from "metabase-types/api";

import { getColumns } from "./utils";

type QueryExecutionTableProps = {
  items: QueryExecution[];
  databasesById: Map<DatabaseId, Database>;
  selectedId: QueryExecutionId | undefined;
  onSelect: (item: QueryExecution) => void;
};

export function QueryExecutionTable({
  items,
  databasesById,
  selectedId,
  onSelect,
}: QueryExecutionTableProps) {
  const columns = useMemo(() => getColumns({ databasesById }), [databasesById]);

  const handleRowClick = useCallback(
    (row: Row<QueryExecution>) => onSelect(row.original),
    [onSelect],
  );

  const treeTableInstance = useTreeTableInstance<QueryExecution>({
    data: items,
    columns,
    getNodeId: (item) => String(item.id),
    selectedRowId: selectedId != null ? String(selectedId) : undefined,
    onRowActivate: handleRowClick,
  });

  return (
    <Card
      className={CS.overflowHidden}
      p={0}
      flex="0 1 auto"
      mih={0}
      shadow="none"
      withBorder
      data-testid="query-execution-table"
    >
      <TreeTable
        instance={treeTableInstance}
        emptyState={<ListEmptyState label={t`No queries yet`} />}
        ariaLabel={t`Query executions`}
        onRowClick={handleRowClick}
      />
    </Card>
  );
}
