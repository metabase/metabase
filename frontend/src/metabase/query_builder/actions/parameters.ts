import { createThunkAction } from "metabase/lib/redux";
import { CardApi } from "metabase/services";
import { getParameterValuesSearchCache } from "metabase/query_builder/selectors";
import { CardId, Parameter } from "metabase-types/api";
import { Dispatch, GetState } from "metabase-types/store";

interface FetchParameterValuesOpts {
  cardId: CardId;
  parameter: Parameter;
  query?: string;
}

export const FETCH_CARD_PARAMETER_VALUES =
  "metabase/qb/FETCH_CARD_PARAMETER_VALUES";

export const fetchCardParameterValues = createThunkAction(
  FETCH_CARD_PARAMETER_VALUES,
  ({ cardId, parameter, query }: FetchParameterValuesOpts) =>
    async (dispatch: Dispatch, getState: GetState) => {
      const cache = getParameterValuesSearchCache(getState());
      const queryKey = { cardId, paramId: parameter.id, query };
      const cacheKey = JSON.stringify(queryKey);

      if (cache[cacheKey]) {
        return cache[cacheKey];
      }

      const { values, has_more_values } = query
        ? await CardApi.parameterSearch(queryKey)
        : await CardApi.parameterValues(queryKey);

      const results = values.map((value: unknown) =>
        Array.isArray(value) ? value : [value],
      );

      return { cacheKey, results, has_more_values };
    },
);
