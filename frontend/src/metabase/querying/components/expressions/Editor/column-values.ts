import { useCallback } from "react";

import { fieldApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import type { GetColumnValues } from "metabase/querying/expressions";
import { useDispatch } from "metabase/redux";
import * as Lib from "metabase-lib";
import type { FieldValue } from "metabase-types/api";

/**
 * Gives the values of a column from the field values that Metabase keeps.
 * A field with a short list of values gives them from the cached list. A
 * field with many values gives the matches of a search.
 */
export function useGetColumnValues(query: Lib.Query): GetColumnValues {
  const dispatch = useDispatch();

  return useCallback(
    async (column, search, limit) => {
      const { fieldId, searchFieldId, hasFieldValues } =
        Lib.fieldValuesSearchInfo(query, column);
      if (fieldId == null) {
        return [];
      }
      try {
        if (hasFieldValues === "list") {
          const { values } = await runRtkEndpoint(
            fieldId,
            dispatch,
            fieldApi.endpoints.getFieldValues,
            { forceRefetch: false },
          );
          return filterValues(getTexts(values), search).slice(0, limit);
        }
        if (hasFieldValues === "search" && searchFieldId != null && search) {
          const values = await runRtkEndpoint(
            { fieldId, searchFieldId, value: search, limit },
            dispatch,
            fieldApi.endpoints.searchFieldValues,
            { forceRefetch: false },
          );
          return getTexts(values).slice(0, limit);
        }
      } catch {
        // No values for autocomplete is fine.
      }
      return [];
    },
    [dispatch, query],
  );
}

function getTexts(values: FieldValue[]) {
  return values
    .map(([value]) => value)
    .filter((value): value is string => typeof value === "string");
}

/** The values that contain `search`, with the values that start with it first. */
function filterValues(values: string[], search: string) {
  const text = search.toLowerCase();
  if (text === "") {
    return values;
  }
  const matches = values.filter((value) => value.toLowerCase().includes(text));
  return [
    ...matches.filter((value) => value.toLowerCase().startsWith(text)),
    ...matches.filter((value) => !value.toLowerCase().startsWith(text)),
  ];
}
