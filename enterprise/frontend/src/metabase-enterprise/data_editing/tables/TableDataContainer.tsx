import { useMount } from "react-use";

import {
  skipToken,
  useGetDatabaseMetadataQuery,
  useGetTableDataQuery,
  useGetTableQuery,
} from "metabase/api";
import { capitalize } from "metabase/lib/formatting/strings";
import { useDispatch } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";

import { TableDataView } from "./TableDataView";
import { TableDataViewHeader } from "./TableDataViewHeader";

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

  const { data: database } = useGetDatabaseMetadataQuery({ id: dbId }); // TODO: consider using just "dbId" to avoid extra data request

  const { data: datasetData, isLoading } = useGetTableDataQuery({
    dbId,
    tableId: tableName,
  });

  const dispatch = useDispatch();

  useMount(() => {
    dispatch(closeNavbar());
  });

  if (isLoading) {
    // TODO: show loader
    return null;
  }

  if (!datasetData) {
    // TODO: show error
    return null;
  }

  return (
    <div data-testid="table-data-view-root">
      {database && (
        <TableDataViewHeader
          database={database}
          tableName={capitalize(tableName, { lowercase: true })}
        />
      )}
      <TableDataView data={datasetData} />
    </div>
  );
};
