import { useEffect, useState } from "react";

import {
  skipToken,
  useGetDatabaseMetadataQuery,
  useListDatabaseSchemaTablesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import * as Urls from "metabase/urls";
import { isSyncInProgress } from "metabase/utils/syncing";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import {
  type DatabaseId,
  type Table,
  isConcreteTableId,
} from "metabase-types/api";

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
    return dbId as DatabaseId;
  }
};

const getSchemaName = (props: TableBrowserContainerProps): string | undefined =>
  props.schemaName || props.params?.schemaName || undefined;

export const getTableUrl = (table: Table, metadata?: Metadata): string => {
  // The Saved Questions virtual database exposes cards as "tables" with virtual
  // ids (e.g. card__17). Those have no /table/:slug route, so fall back to the
  // ad-hoc question URL for them.
  if (!isConcreteTableId(table.id)) {
    const question = metadata?.table(table.id)?.newQuestion();
    return question ? Urls.question(question) : "";
  }
  return Urls.table({ id: table.id, name: table.display_name });
};

export const TableBrowser = (props: TableBrowserContainerProps) => {
  const dbId = getDatabaseId(props, { includeVirtual: true });
  const schemaName = getSchemaName(props);
  const { showSchemaInHeader } = props;
  const metadata = useSelector(getMetadata);
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
    dbId != null && !useSchemaTables ? { id: dbId } : skipToken,
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

  if (dbId == null) {
    return null;
  }

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
      <TableBrowserInner
        tables={tables}
        getTableUrl={getTableUrl}
        metadata={metadata}
        dbId={dbId}
        schemaName={schemaName}
        xraysEnabled={xraysEnabled}
        showSchemaInHeader={showSchemaInHeader}
      />
    </LoadingAndErrorWrapper>
  );
};
