import type { OnChangeFn, Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { useNavigate } from "metabase/router";
import { TreeTable, useTreeTableInstance } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DataApp } from "metabase-types/api";

import type { DataAppRow } from "./types";
import { getColumns, getRows } from "./utils";

type DataAppTableProps = {
  apps: DataApp[];
  searchQuery: string;
  onSearchQueryChange: OnChangeFn<string>;
};

export function DataAppTable({
  apps,
  searchQuery,
  onSearchQueryChange,
}: DataAppTableProps) {
  const navigate = useNavigate();
  const rows = useMemo(() => getRows(apps), [apps]);
  const columns = useMemo(() => getColumns(), []);

  const handleRowActivate = useCallback(
    (row: Row<DataAppRow>) => {
      navigate(Urls.dataStudioDataApp(row.original.slug));
    },
    [navigate],
  );

  const treeTableInstance = useTreeTableInstance({
    data: rows,
    columns,
    getNodeId: (row) => row.slug,
    globalFilter: searchQuery,
    onGlobalFilterChange: onSearchQueryChange,
    onRowActivate: handleRowActivate,
  });

  return (
    <TreeTable
      instance={treeTableInstance}
      emptyState={
        searchQuery ? <ListEmptyState label={t`No data apps found`} /> : null
      }
      onRowClick={handleRowActivate}
    />
  );
}
