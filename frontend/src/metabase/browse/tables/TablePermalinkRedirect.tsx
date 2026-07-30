import { useEffect } from "react";

import { useListDatabasesQuery, useListTablesQuery } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { findDatabaseByName } from "metabase/common/utils/database";
import { useDispatch } from "metabase/redux";
import { replace, useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import type { DatabaseId, Table } from "metabase-types/api";
import { isConcreteTableId } from "metabase-types/api";

const findTable = (
  tables: Table[],
  dbId: DatabaseId,
  schemaName: string | undefined,
  tableName: string,
) =>
  tables.find(
    (table) =>
      table.db_id === dbId &&
      table.name === tableName &&
      (table.schema || null) === (schemaName || null),
  );

export const TablePermalinkRedirect = () => {
  const {
    dbName = "",
    schemaName,
    tableName = "",
  } = useParams<{ dbName: string; schemaName: string; tableName: string }>();

  const dispatch = useDispatch();
  const {
    data: databasesData,
    error: databasesError,
    isLoading: isLoadingDatabases,
  } = useListDatabasesQuery();
  const {
    data: tables,
    error: tablesError,
    isLoading: isLoadingTables,
  } = useListTablesQuery({
    term: tableName,
  });

  const databases = databasesData?.data ?? [];
  const dbId = Urls.extractEntityId(dbName);
  const database =
    dbId == null
      ? findDatabaseByName(databases, dbName)
      : databases.find((database) => database.id === dbId);

  const table = database
    ? findTable(tables ?? [], database.id, schemaName, tableName)
    : undefined;
  const targetUrl =
    table && isConcreteTableId(table.id)
      ? Urls.table({ id: table.id, name: table.display_name })
      : null;

  useEffect(() => {
    if (targetUrl) {
      dispatch(replace(targetUrl));
    }
  }, [targetUrl, dispatch]);

  const error = databasesError ?? tablesError;

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (isLoadingDatabases || isLoadingTables || table) {
    return <LoadingAndErrorWrapper loading />;
  }

  return <NotFound />;
};
