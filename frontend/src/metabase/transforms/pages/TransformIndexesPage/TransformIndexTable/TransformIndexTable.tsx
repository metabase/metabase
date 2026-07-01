import type { SortingState } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { useSetting } from "metabase/common/hooks";
import { TreeTable, useTreeTableInstance } from "metabase/ui";
import { isNullOrUndefined } from "metabase/utils/types";
import type { TableIndexEntry, UserId } from "metabase-types/api";

import { getColumns } from "./columns";
import type { IndexRow } from "./types";
import { getIndexKey } from "./utils";

type TransformIndexTableProps = {
  indexes: TableIndexEntry[];
};

const DEFAULT_SORTING: SortingState = [{ id: "name", desc: false }];

export function TransformIndexTable({ indexes }: TransformIndexTableProps) {
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

  const columns = useMemo(() => getColumns(systemTimezone), [systemTimezone]);

  const treeTableInstance = useTreeTableInstance<IndexRow>({
    data: rows,
    columns,
    getNodeId: (row) => row.id,
    enableSorting: true,
    sorting,
    onSortingChange: setSorting,
  });

  return (
    <TreeTable
      instance={treeTableInstance}
      hierarchical={false}
      emptyState={<ListEmptyState label={t`No indexes yet`} />}
      ariaLabel={t`Transform indexes`}
    />
  );
}
