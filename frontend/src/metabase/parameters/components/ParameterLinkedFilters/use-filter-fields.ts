import { useGetValidDashboardFilterFieldsQuery } from "metabase/api";
import { getFields } from "metabase-lib/v1/parameters/utils/parameter-fields";
import type { FieldId, Parameter } from "metabase-types/api";

export type UseFilterFieldsState = {
  fieldMapping: FilterFieldMapping[];
  isLoading: boolean;
  error?: unknown;
};

export type FilterFieldMapping = {
  filteredId: FieldId;
  filteringId: FieldId;
};

export function useFilterFields(
  parameter: Parameter,
  otherParameter: Parameter,
): UseFilterFieldsState {
  const filtered = getFields(parameter).map((field) => Number(field.id));
  const filtering = getFields(otherParameter).map((field) => Number(field.id));
  const isEmpty = filtered.length === 0 || filtering.length === 0;
  const { data, isLoading, error } = useGetValidDashboardFilterFieldsQuery(
    { filtered, filtering },
    { skip: isEmpty },
  );

  return {
    fieldMapping: data ? getFieldMapping(data) : [],
    isLoading,
    error,
  };
}

function getFieldMapping(
  data: Record<FieldId, FieldId[]>,
): FilterFieldMapping[] {
  return Object.entries(data).flatMap(([filteredId, filteringIds]) =>
    filteringIds.map((filteringId) => ({
      filteringId,
      filteredId: parseInt(filteredId, 10),
    })),
  );
}
