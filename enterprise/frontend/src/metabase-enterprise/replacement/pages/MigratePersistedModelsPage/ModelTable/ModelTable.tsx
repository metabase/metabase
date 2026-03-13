import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/transforms/components/ListEmptyState";
import {
  Card as MantineCard,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type { Card } from "metabase-types/api";

import { getColumnWidths, getColumns } from "./utils";

type ModelTableProps = {
  cards: Card[];
  isLoading?: boolean;
  onSelect: (card: Card) => void;
};

export function ModelTable({
  cards,
  isLoading = false,
  onSelect,
}: ModelTableProps) {
  const columns = useMemo(() => getColumns(), []);

  const handleRowActivate = useCallback(
    (row: Row<Card>) => onSelect(row.original),
    [onSelect],
  );

  const treeTableInstance = useTreeTableInstance<Card>({
    data: cards,
    columns,
    getNodeId: (card) => String(card.id),
    onRowActivate: handleRowActivate,
  });

  return (
    <MantineCard
      flex="0 1 auto"
      mih={0}
      p={0}
      withBorder
      data-testid="model-list"
    >
      {isLoading ? (
        <TreeTableSkeleton columnWidths={getColumnWidths()} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          emptyState={<ListEmptyState label={t`No persisted models found`} />}
          onRowClick={handleRowActivate}
        />
      )}
    </MantineCard>
  );
}
