import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  Card,
  Text,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import { getColumnWidths, getColumns } from "./utils";

type ModelTableProps = {
  results: SearchResult[];
  isLoading?: boolean;
  onSelect: (result: SearchResult) => void;
};

export function ModelTable({
  results,
  isLoading = false,
  onSelect,
}: ModelTableProps) {
  const columns = useMemo(() => getColumns(), []);

  const handleRowActivate = useCallback(
    (row: Row<SearchResult>) => onSelect(row.original),
    [onSelect],
  );

  const treeTableInstance = useTreeTableInstance<SearchResult>({
    data: results,
    columns,
    getNodeId: (result) => String(result.id),
    onRowActivate: handleRowActivate,
  });

  return (
    <Card flex="0 1 auto" mih={0} p={0} withBorder data-testid="model-list">
      {isLoading ? (
        <TreeTableSkeleton columnWidths={getColumnWidths()} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          emptyState={
            <Text p="lg" ta="center" c="text-secondary">
              {t`No models found`}
            </Text>
          }
          onRowClick={handleRowActivate}
        />
      )}
    </Card>
  );
}
