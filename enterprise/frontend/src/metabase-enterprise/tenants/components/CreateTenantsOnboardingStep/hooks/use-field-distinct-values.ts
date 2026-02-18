import { useMemo } from "react";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetFieldQuery,
} from "metabase/api";
import type { FieldId, LocalFieldReference } from "metabase-types/api";

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

  const query = useMemo(() => {
    if (fieldId == null || tableId == null || databaseId == null) {
      return null;
    }

    const breakout = [
      ["field", fieldId, null],
    ] as const satisfies LocalFieldReference[];

    return {
      database: databaseId,
      type: "query" as const,
      query: {
        "source-table": tableId,
        breakout,
        limit: DISTINCT_VALUES_LIMIT,
      },
    };
  }, [fieldId, tableId, databaseId]);

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
    isLoading: isFieldLoading || isAdHocQueryLoading,
  };
}
