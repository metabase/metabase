import { useMemo } from "react";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetFieldQuery,
} from "metabase/api";
import type { FieldId } from "metabase-types/api";

const DISTINCT_VALUES_LIMIT = 100;

/**
 * Hook to fetch distinct values for a field by running an ad-hoc query.
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

    return {
      database: databaseId,
      type: "query" as const,
      query: {
        "source-table": tableId,
        breakout: [["field", fieldId, null]],
        limit: DISTINCT_VALUES_LIMIT,
      },
    };
  }, [fieldId, tableId, databaseId]);

  const { data: queryResult, isLoading: isQueryLoading } =
    useGetAdhocQueryQuery(query ?? skipToken);

  const values = useMemo(() => {
    if (!queryResult?.data?.rows) {
      return [];
    }

    return queryResult.data.rows
      .map((row) => {
        const value = row[0];
        return value != null ? String(value) : null;
      })
      .filter((value): value is string => value !== null);
  }, [queryResult]);

  return {
    values,
    isLoading: isFieldLoading || isQueryLoading,
  };
}
