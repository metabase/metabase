import { useEffect, useMemo, useState } from "react";

import {
  useGetRemappedFieldValueQuery,
  useSearchFieldValuesQuery,
} from "metabase/api/field";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { getFieldOptions } from "metabase/querying/common/components/FieldValuePicker/utils";
import type { FieldValue, RowValue } from "metabase-types/api";

const SEARCH_LIMIT_DEFAULT = 20;
const SEARCH_DEBOUNCE = 500;

type UseActionInputSearchableOptionsProps = {
  initialValue?: RowValue;
  search: string;
  fieldId: number;
  searchFieldId?: number;
  limit?: number;
  skipSearchQuery?: boolean;
};

export function useActionInputSearchableOptions({
  initialValue,
  search,
  fieldId,
  searchFieldId = fieldId,
  limit = SEARCH_LIMIT_DEFAULT,
  skipSearchQuery = false,
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
  } = useSearchFieldValuesQuery(
    {
      fieldId: fieldId,
      searchFieldId: searchFieldId,
      // empty string is invalid from the API perspective
      value: searchValueToFetch === "" ? undefined : searchValueToFetch,
      limit: SEARCH_LIMIT_DEFAULT,
    },
    { skip: skipSearchQuery },
  );

  const { data: initialFieldValue } = useGetRemappedFieldValueQuery(
    {
      fieldId,
      remappedFieldId: searchFieldId,
      value: initialValue?.toString() ?? "",
    },
    { skip: !initialValue || fieldId === searchFieldId },
  );

  useEffect(() => {
    if (!initialFieldValues && fieldValues) {
      setInitialFieldValues(fieldValues);
    }
  }, [initialFieldValues, fieldValues]);

  const options = useMemo(() => {
    if (fieldValues) {
      const mergedFieldValues = fieldValues.slice();
      if (initialFieldValue) {
        const hasInitialValueInFieldValues = !!mergedFieldValues.find(
          ([value]) => value === initialFieldValue[0],
        );

        if (!hasInitialValueInFieldValues) {
          mergedFieldValues.push(initialFieldValue);
        }
      }

      const options = getFieldOptions(mergedFieldValues);

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

    if (initialFieldValue) {
      return getFieldOptions([initialFieldValue]);
    }

    return [];
  }, [shouldPerformLocalSearch, fieldValues, initialFieldValue, search]);

  return {
    options,
    isLoading,
    isFetching:
      (isFetching || search !== debouncedSearch) && !shouldPerformLocalSearch,
  };
}
