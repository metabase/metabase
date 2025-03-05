import { useCallback } from "react";
import { useMount } from "react-use";

import {
  useGetDatabaseMetadataQuery,
  useGetTableDataQuery,
} from "metabase/api";
import { capitalize } from "metabase/lib/formatting/strings";
import { useDispatch } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import {
  // useDeleteTableRowsMutation,
  // useInsertTableRowsMutation,
  useUpdateTableRowsMutation,
} from "metabase-enterprise/api";

import { TableDataView } from "./TableDataView";
import S from "./TableDataView.module.css";
import { TableDataViewHeader } from "./TableDataViewHeader";
import type { RowCellsWithPkValue } from "./types";

type TableDataViewProps = {
  params: {
    dbId: string;
    tableName: string;
  };
};

export const TableDataContainer = ({
  params: { dbId: dbIdParam, tableName },
}: TableDataViewProps) => {
  const dbId = parseInt(dbIdParam, 10);

  const dispatch = useDispatch();

  const { data: database } = useGetDatabaseMetadataQuery({ id: dbId }); // TODO: consider using just "dbId" to avoid extra data request

  const { data: datasetData, isLoading } = useGetTableDataQuery({
    dbId,
    tableId: tableName,
  });

  const [updateTableRows] = useUpdateTableRowsMutation();

  useMount(() => {
    dispatch(closeNavbar());
  });

  const handleCellValueUpdate = useCallback(
    (updatedRow: RowCellsWithPkValue) => {
      return updateTableRows({
        tableName, // TODO: sanitize table name - we get it from URL ???
        rows: [updatedRow],
      });
    },
    [tableName, updateTableRows],
  );

  if (isLoading) {
    // TODO: show loader
    return null;
  }

  if (!datasetData) {
    // TODO: show error
    return null;
  }

  return (
    <div className={S.container} data-testid="table-data-view-root">
      {database && (
        <TableDataViewHeader
          database={database}
          tableName={capitalize(tableName, { lowercase: true })}
        />
      )}
      <TableDataView
        data={datasetData}
        onCellValueUpdate={handleCellValueUpdate}
      />
    </div>
  );
};
