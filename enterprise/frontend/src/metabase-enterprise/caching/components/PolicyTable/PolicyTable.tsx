import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { t } from "ttag";

import { getCollectionPathAsString } from "metabase/common/collections/utils";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Card,
  Ellipsified,
  FixedSizeIcon,
  Flex,
  Text,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { CollectionEssentials, IconName } from "metabase-types/api";

export type PolicyTableRowBase = {
  id: string;
  name: string;
  icon: IconName;
  collection?: CollectionEssentials | null;
  policyLabel: string | null;
  usesDefaultPolicy: boolean;
};

type Props<TRow extends PolicyTableRowBase> = {
  rows: TRow[];
  withCollectionColumn?: boolean;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  selectedRowId: string | null;
  onRowClick: (row: TRow) => void;
  getRowProps?: (row: Row<TRow>) => Record<string, unknown>;
  emptyState: React.ReactNode;
  "data-testid"?: string;
};

export function PolicyTable<TRow extends PolicyTableRowBase>({
  rows,
  withCollectionColumn = false,
  sorting,
  onSortingChange,
  selectedRowId,
  onRowClick,
  getRowProps,
  emptyState,
  "data-testid": dataTestId,
}: Props<TRow>) {
  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      if (next.length === 0 && sorting[0] !== undefined) {
        onSortingChange([{ id: sorting[0].id, desc: false }]);
        return;
      }
      onSortingChange(next);
    },
    [sorting, onSortingChange],
  );

  const columns = useMemo<TreeTableColumnDef<TRow>[]>(() => {
    const nameColumn: TreeTableColumnDef<TRow> = {
      id: "name",
      header: t`Name`,
      width: "auto",
      minWidth: 200,
      enableSorting: true,
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <Flex gap="sm" align="center" miw={0}>
          <FixedSizeIcon name={row.original.icon} c="text-secondary" />
          <Ellipsified tooltip={row.original.name}>
            {row.original.name}
          </Ellipsified>
        </Flex>
      ),
    };
    const collectionColumn: TreeTableColumnDef<TRow> = {
      id: "collection",
      header: t`Collection`,
      width: "auto",
      minWidth: 200,
      enableSorting: true,
      accessorFn: (row) =>
        row.collection ? getCollectionPathAsString(row.collection) : "",
      cell: ({ row }) => {
        const { collection } = row.original;
        if (!collection) {
          return null;
        }
        const path = getCollectionPathAsString(collection);
        return <Ellipsified tooltip={path}>{path}</Ellipsified>;
      },
    };
    const policyColumn: TreeTableColumnDef<TRow> = {
      id: "policy",
      header: t`Policy`,
      width: "auto",
      minWidth: 140,
      enableSorting: true,
      // Sorting is manual (see sortPolicyRows), but getCanSort requires an accessorFn
      accessorFn: (row) => row.policyLabel ?? "",
      cell: ({ row }) => (
        <Text
          size="md"
          c={row.original.usesDefaultPolicy ? "text-disabled" : "text-primary"}
          data-uses-default-policy={row.original.usesDefaultPolicy}
        >
          {row.original.policyLabel ?? EMPTY_CELL_PLACEHOLDER}
        </Text>
      ),
    };
    return withCollectionColumn
      ? [nameColumn, collectionColumn, policyColumn]
      : [nameColumn, policyColumn];
  }, [withCollectionColumn]);

  const instanceRef = useRef<{
    setActiveRowId: (id: string | null) => void;
  } | null>(null);

  const handleRowActivate = useCallback(
    (row: Row<TRow>) => {
      onRowClick(row.original);
      // TreeTable focuses any activated row right away, but the parent may
      // park the selection change behind a dirty-form confirmation; keep the
      // highlight on the selected row until the selection actually moves
      // (the effect below follows it when it does)
      instanceRef.current?.setActiveRowId(selectedRowId);
    },
    [onRowClick, selectedRowId],
  );

  const instance = useTreeTableInstance<TRow>({
    data: rows,
    columns,
    getNodeId: (row) => row.id,
    sorting,
    manualSorting: true,
    onSortingChange: handleSortingChange,
    onRowActivate: handleRowActivate,
    selectedRowId,
  });
  instanceRef.current = instance;

  // Keyboard focus stays on the last clicked row unless synced; when the
  // panel's prev/next buttons move the selection, that row would also keep
  // rendering as active
  const { setActiveRowId } = instance;
  useEffect(() => {
    setActiveRowId(selectedRowId);
  }, [selectedRowId, setActiveRowId]);

  return (
    <Card
      flex="0 1 auto"
      mih={0}
      p={0}
      pos="relative"
      withBorder
      data-testid={dataTestId}
    >
      <TreeTable
        instance={instance}
        hierarchical={false}
        ariaLabel={t`Caching policies`}
        onRowClick={handleRowActivate}
        getRowProps={getRowProps}
        emptyState={emptyState}
      />
    </Card>
  );
}
