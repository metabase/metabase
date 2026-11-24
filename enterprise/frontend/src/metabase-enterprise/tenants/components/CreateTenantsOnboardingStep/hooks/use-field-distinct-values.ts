import { useMemo } from "react";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetFieldQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { useMetadataProvider } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import type { FieldId } from "metabase-types/api";

/** How many distinct values to fetch from the field. */
const DISTINCT_VALUES_LIMIT = 100;

/**
 * Fetch distinct values for a field by running an ad-hoc query.
 * This is used for autocompleting multi-tenancy column values.
 *
 * We intentionally use an ad-hoc query instead of `useGetFieldValuesQuery`.
 * The field values API only returns pre-scanned values.
 * During onboarding the cache is empty and we need fresh values.
 */
export function useFieldDistinctValues(fieldId: FieldId | undefined) {
  const { data: field, isLoading: isFieldLoading } = useGetFieldQuery(
    fieldId != null
      ? { id: fieldId, include_editable_data_model: true }
      : skipToken,
  );

  const tableId = field?.table_id;
  const databaseId = field?.table?.db_id;

  const { data: table, isLoading: isTableLoading } =
    useGetTableQueryMetadataQuery(
      tableId != null ? { id: tableId } : skipToken,
    );
  const metadataProvider = useMetadataProvider(databaseId ?? null);

  const query = useMemo(() => {
    if (fieldId == null || table == null) {
      return null;
    }

    const tableMetadata = Lib.tableMetadata(metadataProvider, table.id);
    const column = Lib.fieldMetadata(metadataProvider, fieldId);
    if (tableMetadata == null || column == null) {
      return null;
    }

    const tableQuery = Lib.queryFromTableOrCardMetadata(
      metadataProvider,
      tableMetadata,
    );
    const breakoutQuery = Lib.breakout(tableQuery, -1, column);
    return {
      ...Lib.toJsQuery(Lib.limit(breakoutQuery, -1, DISTINCT_VALUES_LIMIT)),
      ignore_error: true,
    };
  }, [fieldId, table, metadataProvider]);

  const { data: adhocQueryDataset, isLoading: isAdHocQueryLoading } =
    useGetAdhocQueryQuery(query ?? skipToken);

  // Extract row values from query results
  const values = useMemo(() => {
    if (!adhocQueryDataset?.data?.rows) {
      return [];
    }

    return adhocQueryDataset.data.rows
      .map(([rowValue]) => (rowValue != null ? String(rowValue) : null))
      .filter((rowValue): rowValue is string => rowValue !== null);
  }, [adhocQueryDataset]);

  return {
    values,
    isLoading: isFieldLoading || isTableLoading || isAdHocQueryLoading,
  };
}
