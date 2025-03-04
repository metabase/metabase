import { useCallback } from "react";
import { useMount } from "react-use";

import {
  useGetDatabaseMetadataQuery,
  useGetTableDataQuery,
} from "metabase/api";
import { capitalize } from "metabase/lib/formatting/strings";
import { useDispatch } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import { useUpdateTableCellMutation } from "metabase-enterprise/api";

import { TableDataView } from "./TableDataView";
import S from "./TableDataView.module.css";
import { TableDataViewHeader } from "./TableDataViewHeader";
import type { CellValueUpdateHandlerParameters } from "./types";

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

  const [updateTableCellValue] = useUpdateTableCellMutation();

  useMount(() => {
    dispatch(closeNavbar());
  });

  const handleCellValueUpdate = useCallback(
    ({ columnId, rowPK, newValue }: CellValueUpdateHandlerParameters) => {
      return updateTableCellValue({
        fieldId: columnId,
        rowId: rowPK,
        newValue,
      });
    },
    [updateTableCellValue],
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
