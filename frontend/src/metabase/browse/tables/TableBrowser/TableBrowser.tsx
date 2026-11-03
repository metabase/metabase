import { useEffect, useMemo, useState } from "react";

import {
  skipToken,
  useGetDatabaseMetadataQuery,
  useListDatabaseSchemaTablesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUserIsAdmin } from "metabase/current-user";
import {
  isDataLayerVisible,
  useDataLayers,
} from "metabase/metadata/data-layers";
import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/settings";
import * as Urls from "metabase/urls";
import { isSyncInProgress } from "metabase/utils/syncing";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { DatabaseId, Table } from "metabase-types/api";

import { RELOAD_INTERVAL } from "../../constants";

import { TableBrowserInner } from "./TableBrowserInner";

type RouteParams = {
  dbId?: string;
  schemaName?: string;
  slug?: string;
};

type TableBrowserContainerProps = {
  dbId?: DatabaseId | string;
  schemaName?: string;
  params?: RouteParams;
  showSchemaInHeader?: boolean;
};

const EMPTY_TABLES: Table[] = [];

const getDatabaseId = (
  props: TableBrowserContainerProps,
  { includeVirtual = false }: { includeVirtual?: boolean } = {},
): DatabaseId | undefined => {
  const { params } = props;
  const dbId =
    parseInt(String(props.dbId)) ||
    parseInt(String(params?.dbId)) ||
    Urls.extractEntityId(params?.slug);

  if (!Number.isSafeInteger(dbId)) {
    return undefined;
  } else if (dbId === SAVED_QUESTIONS_VIRTUAL_DB_ID && !includeVirtual) {
    return undefined;
  } else {
    return dbId;
  }
};

const getSchemaName = (props: TableBrowserContainerProps): string | undefined =>
  props.schemaName || props.params?.schemaName || undefined;

export const TableBrowser = (props: TableBrowserContainerProps) => {
  const dbId = getDatabaseId(props, { includeVirtual: true });
  const schemaName = getSchemaName(props);
  const { showSchemaInHeader } = props;
  const xraysEnabled = useSelector((state) =>
    getSetting(state, "enable-xrays"),
  );

  // Poll while any table is still syncing so newly-added databases refresh.
  const [reloadInterval, setReloadInterval] = useState(0);
  const useSchemaTables = dbId != null && schemaName != null;

  const schemaTablesResult = useListDatabaseSchemaTablesQuery(
    useSchemaTables ? { id: dbId, schema: schemaName } : skipToken,
    { pollingInterval: reloadInterval || undefined },
  );
  const databaseResult = useGetDatabaseMetadataQuery(
    dbId != null && !useSchemaTables
      ? { id: dbId, skip_fields: true }
      : skipToken,
    { pollingInterval: reloadInterval || undefined },
  );

  const tables =
    (useSchemaTables ? schemaTablesResult.data : databaseResult.data?.tables) ??
    EMPTY_TABLES;
  const isLoading = useSchemaTables
    ? schemaTablesResult.isLoading
    : databaseResult.isLoading;
  const error = useSchemaTables
    ? schemaTablesResult.error
    : databaseResult.error;

  useEffect(() => {
    setReloadInterval(tables.some(isSyncInProgress) ? RELOAD_INTERVAL : 0);
  }, [tables]);

  // PROTOTYPE: mocked data layers. A table uses its own layer if it overrides
  // its schema's, otherwise its schema's.
  const isAdmin = useSelector(getUserIsAdmin);
  const { getTableDataLayer } = useDataLayers();
  const visibleTables = useMemo(
    () =>
      dbId == null
        ? tables
        : tables.filter((table) =>
            isDataLayerVisible(
              getTableDataLayer(dbId, table.schema, table.id).layer,
              { isAdmin },
            ),
          ),
    [dbId, tables, getTableDataLayer, isAdmin],
  );

  if (dbId == null) {
    return null;
  }

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
      <TableBrowserInner
        tables={visibleTables}
        dbId={dbId}
        schemaName={schemaName}
        xraysEnabled={xraysEnabled}
        showSchemaInHeader={showSchemaInHeader}
      />
    </LoadingAndErrorWrapper>
  );
};
