import { useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { Center, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { Database, DatabaseId } from "metabase-types/api";

import type { WorkspaceOverviewDatabaseRow } from "../types";

import { getOverviewColumns } from "./utils";

type DatabaseOverviewTableProps = {
  entries: WorkspaceOverviewDatabaseRow[];
  databasesById: Map<DatabaseId, Database>;
};

export function DatabaseOverviewTable({
  entries,
  databasesById,
}: DatabaseOverviewTableProps) {
  const rows = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        database: databasesById.get(entry.databaseId) ?? entry.database,
      })),
    [entries, databasesById],
  );

  const columns = useMemo(() => getOverviewColumns(), []);

  const treeTableInstance = useTreeTableInstance<WorkspaceOverviewDatabaseRow>({
    data: rows,
    columns,
    getNodeId: (row) => String(row.databaseId),
  });

  if (entries.length === 0) {
    return (
      <Center p="xl">
        <ListEmptyState label={t`No databases in this workspace`} />
      </Center>
    );
  }

  return (
    <TreeTable
      instance={treeTableInstance}
      ariaLabel={t`Workspace databases`}
    />
  );
}
