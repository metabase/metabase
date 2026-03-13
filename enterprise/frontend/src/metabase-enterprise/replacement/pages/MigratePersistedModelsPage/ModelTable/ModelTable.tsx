import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  Card as MantineCard,
  Text,
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
          emptyState={
            <Text p="lg" ta="center" c="text-secondary">
              {t`No persisted models found`}
            </Text>
          }
          onRowClick={handleRowActivate}
        />
      )}
    </MantineCard>
  );
}
