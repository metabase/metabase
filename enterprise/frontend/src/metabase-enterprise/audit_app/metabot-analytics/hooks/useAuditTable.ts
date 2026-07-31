import { useMemo } from "react";

import {
  skipToken,
  useGetAdhocQueryMetadataQuery,
  useGetDatabaseMetadataQuery,
} from "metabase/api";
import { useSelector } from "metabase/redux";
import { getMetadataUnfiltered } from "metabase/selectors/metadata";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import * as Lib from "metabase-lib";

import { AUDIT_DB_ID } from "../constants";

type UseAuditTableResult = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  isLoading: boolean;
};

/**
 * Discover an audit database view by name and return its metabase-lib
 * metadata provider + table metadata, ready for query construction.
 *
 * Table IDs in the audit DB vary across instances, so we look up by name
 * (case-insensitive to handle H2 uppercasing).
 */
export function useAuditTable(viewName: string): UseAuditTableResult {
  const { data: database, isLoading: isLoadingTables } =
    useGetDatabaseMetadataQuery({ id: AUDIT_DB_ID, skip_fields: true });

  const tableId = useMemo(() => {
    const lowerName = viewName.toLowerCase();
    const table = database?.tables?.find(
      (table) => table.name?.toLowerCase() === lowerName,
    );
    return typeof table?.id === "number" ? table.id : undefined;
  }, [database, viewName]);

  const metadata = useSelector(getMetadataUnfiltered);

  const provider = useMemo(
    () => Lib.metadataProvider(AUDIT_DB_ID, metadata),
    [metadata],
  );

  const table = useMemo(
    () => (tableId == null ? null : Lib.tableOrCardMetadata(provider, tableId)),
    [provider, tableId],
  );

  const datasetQuery = useMemo(
    () =>
      table == null
        ? undefined
        : Lib.toJsQuery(Lib.queryFromTableOrCardMetadata(provider, table)),
    [provider, table],
  );

  const { data: queryMetadata } = useGetAdhocQueryMetadataQuery(
    datasetQuery ?? skipToken,
  );

  const isLoadingFields = table != null && queryMetadata == null;

  return {
    provider,
    table: isLoadingFields ? null : table,
    isLoading: isLoadingTables || isLoadingFields,
  };
}
