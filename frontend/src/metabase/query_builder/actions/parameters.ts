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
      const apiArgs = { cardId, paramId: parameter.id, query };
      const cacheKey = JSON.stringify(apiArgs);

      if (cache[cacheKey]) {
        return cache[cacheKey];
      }

      const { values, has_more_values } = query
        ? await CardApi.parameterSearch(apiArgs)
        : await CardApi.parameterValues(apiArgs);

      return {
        cacheKey,
        values,
        has_more_values: query ? true : has_more_values,
      };
    },
);
