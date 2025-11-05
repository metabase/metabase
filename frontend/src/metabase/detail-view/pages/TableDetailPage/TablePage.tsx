

import { useEffect } from "react";
import { push } from "react-router-redux";

import { useGetTableQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { tableRowsQuery } from "metabase/lib/urls";

interface Props {
  params: {
    tableId: string;
  };
}

export function TablePage({ params }: Props) {
  const tableId = parseInt(params.tableId, 10);
  const { data: table } = useGetTableQuery({ id: tableId });
  const dbId = table?.db_id;
  const dispatch = useDispatch();

  useEffect(() => {
    if (dbId && tableId) {
      const tableViewUrl = tableRowsQuery(dbId, tableId);
      dispatch(push(tableViewUrl));
    }
  }, [dbId, tableId, dispatch]);

  return (
    <LoadingAndErrorWrapper loading />
  );
}
