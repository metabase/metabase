import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { Center, TreeTable, useTreeTableInstance } from "metabase/ui";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";
import type {
  TableRemappingId,
  WorkspaceDivergedTable,
} from "metabase-types/api";

import { getDivergedTableColumns } from "./utils";

type DivergedTablesSectionProps = {
  tables: WorkspaceDivergedTable[];
  selectedTableId: TableRemappingId | undefined;
  onTableSelect: (table: WorkspaceDivergedTable) => void;
};

export function DivergedTablesSection({
  tables,
  selectedTableId,
  onTableSelect,
}: DivergedTablesSectionProps) {
  const columns = useMemo(() => getDivergedTableColumns(), []);

  const handleRowClick = useCallback(
    (row: Row<WorkspaceDivergedTable>) => onTableSelect(row.original),
    [onTableSelect],
  );

  const treeTableInstance = useTreeTableInstance<WorkspaceDivergedTable>({
    data: tables,
    columns,
    getNodeId: (row) => String(row.id),
    selectedRowId:
      selectedTableId != null ? String(selectedTableId) : undefined,
    onRowActivate: handleRowClick,
  });

  return (
    <TitleSection
      label={t`Diverged tables`}
      description={t`Tables in this workspace that differ from production.`}
    >
      {tables.length === 0 ? (
        <Center p="xl">
          <ListEmptyState label={t`No tables differ from production.`} />
        </Center>
      ) : (
        <TreeTable
          instance={treeTableInstance}
          ariaLabel={t`Diverged tables`}
          onRowClick={handleRowClick}
        />
      )}
    </TitleSection>
  );
}
