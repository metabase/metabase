import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import CS from "metabase/css/core/index.css";
import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type {
  Database,
  DatabaseId,
  TableRemapping,
  TableRemappingId,
} from "metabase-types/api";

import { getColumns } from "./utils";

type RemappingTableProps = {
  remappings: TableRemapping[];
  databasesById: Map<DatabaseId, Database>;
  selectedRemappingId: TableRemappingId | undefined;
  onRemappingSelect: (remapping: TableRemapping) => void;
};

export function RemappingTable({
  remappings,
  databasesById,
  selectedRemappingId,
  onRemappingSelect,
}: RemappingTableProps) {
  const columns = useMemo(() => getColumns({ databasesById }), [databasesById]);

  const handleRowClick = useCallback(
    (row: Row<TableRemapping>) => onRemappingSelect(row.original),
    [onRemappingSelect],
  );

  const treeTableInstance = useTreeTableInstance<TableRemapping>({
    data: remappings,
    columns,
    getNodeId: (remapping) => String(remapping.id),
    selectedRowId:
      selectedRemappingId != null ? String(selectedRemappingId) : undefined,
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
      data-testid="remapping-table"
    >
      <TreeTable
        instance={treeTableInstance}
        emptyState={
          <ListEmptyState
            label={t`Transforms create tables in the isolation schema on their first run. Those remappings will show up here.`}
          />
        }
        ariaLabel={t`Table remappings`}
        onRowClick={handleRowClick}
      />
    </Card>
  );
}
