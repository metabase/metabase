import { useEffect, useMemo, useState } from "react";

import { useSearchFieldValuesQuery } from "metabase/api/field";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { getFieldOptions } from "metabase/querying/filters/components/FilterValuePicker/utils";
import type { FieldValue } from "metabase-types/api";

const SEARCH_LIMIT_DEFAULT = 20;
const SEARCH_DEBOUNCE = 500;

type UseActionInputSearchableOptionsProps = {
  search: string;
  fieldId: number;
  searchFieldId?: number;
  limit?: number;
};

export function useActionInputSearchableOptions({
  search,
  fieldId,
  searchFieldId = fieldId,
  limit = SEARCH_LIMIT_DEFAULT,
}: UseActionInputSearchableOptionsProps) {
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE);
  const [searchValueToFetch, setSearchValueToFetch] = useState(debouncedSearch);

  // Values that are fetched without search value (all values with some limit)
  const [initialFieldValues, setInitialFieldValues] = useState<
    FieldValue[] | undefined
  >(undefined);

  // Local search is performed if there are less than `limit` initial values
  const shouldPerformLocalSearch =
    initialFieldValues && initialFieldValues.length < limit;

  // Update the search value to fetch on every debounced search value change
  // if the local search is disabled
  useEffect(() => {
    if (!shouldPerformLocalSearch) {
      setSearchValueToFetch(debouncedSearch);
    }
  }, [debouncedSearch, shouldPerformLocalSearch]);

  const {
    data: fieldValues,
    isLoading,
    isFetching,
  } = useSearchFieldValuesQuery({
    fieldId: fieldId,
    searchFieldId: searchFieldId,
    // empty string is invalid from the API perspective
    value: searchValueToFetch === "" ? undefined : searchValueToFetch,
    limit: SEARCH_LIMIT_DEFAULT,
  });

  useEffect(() => {
    if (!initialFieldValues && fieldValues) {
      setInitialFieldValues(fieldValues);
    }
  }, [initialFieldValues, fieldValues]);

  const options = useMemo(() => {
    if (fieldValues) {
      const options = getFieldOptions(fieldValues);

      if (shouldPerformLocalSearch) {
        const searchValue = search.toLowerCase().trim();
        return options.filter(
          (item) =>
            item.label.toLowerCase().includes(searchValue) ||
            item.value.toLowerCase().includes(searchValue),
        );
      }

      return options;
    }

    return [];
  }, [shouldPerformLocalSearch, fieldValues, search]);

  return {
    options,
    isLoading,
    isFetching:
      (isFetching || search !== debouncedSearch) && !shouldPerformLocalSearch,
  };
}
