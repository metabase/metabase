import { useMemo } from "react";

import { skipToken } from "metabase/api/api";
import { useGetAdhocQueryQuery } from "metabase/api/dataset";
import {
  useGetTableQueryMetadataQuery,
  useListTableForeignKeysQuery,
} from "metabase/api/table";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import type { StructuredDatasetQuery } from "metabase-types/api";

import { getTableQuery } from "../utils";

import { TableDetailViewInner } from "./TableDetailViewInner";

interface TableDetailViewLoaderProps {
  params: {
    tableId: string;
    rowId: string;
  };
  isEdit?: boolean;
}

export function TableDetailView({
  params,
  isEdit = false,
}: TableDetailViewLoaderProps) {
  const tableId = parseInt(params.tableId, 10);
  const rowId = parseInt(params.rowId, 10);

  const { data: table } = useGetTableQueryMetadataQuery({ id: tableId });
  const { data: tableForeignKeys = [] } = useListTableForeignKeysQuery(tableId);

  const query = useMemo<StructuredDatasetQuery | undefined>(() => {
    return table ? getTableQuery(table) : undefined;
  }, [table]);

  const { data: dataset } = useGetAdhocQueryQuery(query ? query : skipToken);

  if (!table || !dataset) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <TableDetailViewInner
      tableId={tableId}
      rowId={rowId}
      dataset={dataset}
      table={table}
      tableForeignKeys={tableForeignKeys}
      isEdit={isEdit}
    />
  );
}
