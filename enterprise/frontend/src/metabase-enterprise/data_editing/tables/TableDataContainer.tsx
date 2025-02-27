import { useMount } from "react-use";

import {
  skipToken,
  useGetDatabaseMetadataQuery,
  useGetTableDataQuery,
  useGetTableQuery,
} from "metabase/api";
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
  const { data: table } = useGetTableQuery(
    datasetData ? { id: datasetData.table_id } : skipToken,
  );

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
    <>
      {database && (
        <TableDataViewHeader
          database={database}
          tableName={table?.display_name}
        />
      )}
      <TableDataView data={datasetData} />
    </>
  );
};
