import { useEffect, useState } from "react";

import {
  skipToken,
  useGetDatabaseMetadataQuery,
  useListDatabaseSchemaTablesQuery,
} from "metabase/api";
import { BrowseCardsSkeleton } from "metabase/browse/components/BrowseSkeletons";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  LoadingSkeleton,
  MeasuredSkeleton,
} from "metabase/common/components/Skeletons";
import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/settings";
import * as Urls from "metabase/urls";
import { isSyncInProgress } from "metabase/utils/syncing";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { DatabaseId, Table } from "metabase-types/api";

import { RELOAD_INTERVAL } from "../../constants";

import { TableBrowserInner, type TableBrowserTable } from "./TableBrowserInner";

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

export const TABLE_CARDS_SKELETON_COUNT = 12;

// Typical table names, so a first visit's skeleton has realistic line lengths.
// Later visits draw the grid's shape as last shown.
const SAMPLE_TABLES: TableBrowserTable[] = [
  "Orders",
  "Products",
  "Customers",
  "Order line items",
  "Invoices",
  "Subscriptions",
  "Accounts",
  "Page view events",
  "Reviews",
  "Payments",
  "Shipments",
  "Support tickets",
].map((name, index) => ({
  id: -(index + 1),
  db_id: -1,
  name,
  display_name: name,
  initial_sync_status: "complete",
  is_writable: false,
}));

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

  if (dbId == null) {
    return null;
  }

  if (error) {
    return <LoadingAndErrorWrapper error={error} noWrapper />;
  }

  return (
    <MeasuredSkeleton
      loading={isLoading}
      id={`browse-tables-${dbId}-${schemaName ?? ""}`}
      classic={
        <LoadingSkeleton>
          <BrowseCardsSkeleton cards={TABLE_CARDS_SKELETON_COUNT} withCrumbs />
        </LoadingSkeleton>
      }
    >
      <TableBrowserInner
        tables={isLoading ? SAMPLE_TABLES : tables}
        dbId={dbId}
        schemaName={schemaName}
        xraysEnabled={xraysEnabled}
        showSchemaInHeader={showSchemaInHeader}
      />
    </MeasuredSkeleton>
  );
};
