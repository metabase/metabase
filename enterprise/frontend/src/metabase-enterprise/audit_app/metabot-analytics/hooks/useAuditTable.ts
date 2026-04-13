import { useMemo } from "react";

import { useGetDatabaseMetadataQuery } from "metabase/api";
import { getMetadataUnfiltered } from "metabase/selectors/metadata";
import { useSelector } from "metabase/utils/redux";
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
  const { isLoading } = useGetDatabaseMetadataQuery({ id: AUDIT_DB_ID });
  const metadata = useSelector(getMetadataUnfiltered);

  return useMemo(() => {
    if (isLoading) {
      return { provider: null, table: null, isLoading: true };
    }

    const lowerName = viewName.toLowerCase();
    const tableId = Object.keys(metadata.tables).find((key) => {
      const t = metadata.tables[key];
      return t.db_id === AUDIT_DB_ID && t.name?.toLowerCase() === lowerName;
    });

    if (!tableId) {
      return { provider: null, table: null, isLoading: false };
    }

    const provider = Lib.metadataProvider(AUDIT_DB_ID, metadata);
    const table = Lib.tableOrCardMetadata(provider, Number(tableId));

    return { provider, table, isLoading: false };
  }, [isLoading, metadata, viewName]);
}
