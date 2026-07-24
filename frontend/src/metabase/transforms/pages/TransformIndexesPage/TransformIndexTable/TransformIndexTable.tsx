import type { OnChangeFn, Row, SortingState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { useSetting } from "metabase/common/hooks";
import type { TreeTableColumnDef } from "metabase/ui";
import { TreeTable, useTreeTableInstance } from "metabase/ui";
import { isNullOrUndefined } from "metabase/utils/types";
import type { TableIndexEntry, UserId } from "metabase-types/api";

import { getColumns } from "./columns";
import type { IndexRow } from "./types";
import { getIndexKey, isManagedIndex, isPendingDeletion } from "./utils";

type TransformIndexTableProps = {
  indexes: TableIndexEntry[];
  kindLabels: Map<string, string>;
  readOnly?: boolean;
  onEdit: (index: TableIndexEntry) => void;
  onDelete: (index: TableIndexEntry) => void;
};

const DEFAULT_SORTING: SortingState = [{ id: "name", desc: false }];

export function TransformIndexTable({
  indexes,
  kindLabels,
  readOnly,
  onEdit,
  onDelete,
}: TransformIndexTableProps) {
  const systemTimezone = useSetting("system-timezone");
  const { data: usersResponse } = useListUsersQuery();
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);

  const usersById = useMemo(() => {
    const map = new Map<UserId, string>();
    for (const user of usersResponse?.data ?? []) {
      map.set(user.id, user.common_name);
    }
    return map;
  }, [usersResponse]);

  const rows = useMemo<IndexRow[]>(
    () =>
      indexes.map((index, position) => {
        const userId = index.request?.created_by;
        const modifiedBy = isNullOrUndefined(userId)
          ? ""
          : (usersById.get(userId) ?? "");
        return {
          ...index,
          id: getIndexKey(index, position),
          modifiedBy,
        };
      }),
    [indexes, usersById],
  );

  const columns = useMemo(
    () =>
      getColumns({
        systemTimezone,
        kindLabels,
        actions: readOnly ? undefined : { onEdit, onDelete },
      }),
    [systemTimezone, kindLabels, readOnly, onEdit, onDelete],
  );

  const handleRowClick = useCallback(
    (row: Row<IndexRow>) => {
      const index = row.original;
      if (!readOnly && isManagedIndex(index) && !isPendingDeletion(index)) {
        onEdit(index);
      }
    },
    [readOnly, onEdit],
  );

  // Trigger remount and reflow when status column changes.
  // This ensures that column widths are correctly measured after a status change.
  const measureKey = useMemo(
    () => indexes.map(({ request }) => request?.status).join(","),
    [indexes],
  );

  return (
    <TransformIndexTableBody
      key={measureKey}
      rows={rows}
      columns={columns}
      sorting={sorting}
      onSortingChange={setSorting}
      onRowClick={handleRowClick}
    />
  );
}

type TransformIndexTableBodyProps = {
  rows: IndexRow[];
  columns: TreeTableColumnDef<IndexRow>[];
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  onRowClick: (row: Row<IndexRow>) => void;
};

function TransformIndexTableBody({
  rows,
  columns,
  sorting,
  onSortingChange,
  onRowClick,
}: TransformIndexTableBodyProps) {
  const treeTableInstance = useTreeTableInstance<IndexRow>({
    data: rows,
    columns,
    getNodeId: (row) => row.id,
    enableSorting: true,
    sorting,
    onSortingChange,
  });

  return (
    <TreeTable
      instance={treeTableInstance}
      hierarchical={false}
      emptyState={<ListEmptyState label={t`No indexes yet`} />}
      ariaLabel={t`Transform indexes`}
      onRowClick={onRowClick}
    />
  );
}
