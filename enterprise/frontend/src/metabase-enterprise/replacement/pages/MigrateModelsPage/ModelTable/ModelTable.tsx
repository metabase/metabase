import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import { SkeletonSwap } from "metabase/common/components/Skeletons";
import {
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import { getColumnWidths, getColumns } from "./utils";

type ModelTableProps = {
  searchResults: SearchResult[];
  isLoading?: boolean;
  onSelect: (result: SearchResult) => void;
};

export function ModelTable({
  searchResults,
  isLoading = false,
  onSelect,
}: ModelTableProps) {
  const columns = useMemo(() => getColumns(), []);

  const handleRowActivate = useCallback(
    (row: Row<SearchResult>) => onSelect(row.original),
    [onSelect],
  );

  const treeTableInstance = useTreeTableInstance<SearchResult>({
    data: searchResults,
    columns,
    getNodeId: (result) => String(result.id),
    onRowActivate: handleRowActivate,
  });

  return (
    <SkeletonSwap
      loading={isLoading}
      skeleton={<TreeTableSkeleton columnWidths={getColumnWidths()} />}
    >
      <TreeTable instance={treeTableInstance} onRowClick={handleRowActivate} />
    </SkeletonSwap>
  );
}
