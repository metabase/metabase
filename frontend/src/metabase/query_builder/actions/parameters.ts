import { createThunkAction } from "metabase/lib/redux";
import { CardApi } from "metabase/services";
import { getParameterValuesSearchCache } from "metabase/query_builder/selectors";
import { Parameter } from "metabase-types/api";
import { Dispatch, GetState } from "metabase-types/store";
import Question from "metabase-lib/Question";

interface FetchParameterValuesOpts {
  question: Question;
  parameter: Parameter;
  query?: string;
}

export const FETCH_QUESTION_PARAMETER_VALUES =
  "metabase/qb/FETCH_QUESTION_PARAMETER_VALUES";

export const fetchQuestionParameterValues = createThunkAction(
  FETCH_QUESTION_PARAMETER_VALUES,
  ({ question, parameter, query }: FetchParameterValuesOpts) =>
    async (dispatch: Dispatch, getState: GetState) => {
      const cache = getParameterValuesSearchCache(getState());
      const apiArgs = { cardId: question.id(), paramId: parameter.id, query };
      const cacheKey = JSON.stringify(apiArgs);

      if (cache[cacheKey]) {
        return cache[cacheKey];
      }

      const { values, has_more_values } = query
        ? await CardApi.parameterSearch(apiArgs)
        : await CardApi.parameterValues(apiArgs);

      return {
        cacheKey,
        results: values.map((value: any) => [].concat(value)),
        has_more_values: query ? true : has_more_values,
      };
    },
);
