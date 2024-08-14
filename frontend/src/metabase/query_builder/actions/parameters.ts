import { CardApi } from "metabase/services";
import type Question from "metabase-lib/v1/Question";
import type { Parameter } from "metabase-types/api";

interface FetchParameterValuesOpts {
  question: Question;
  parameter: Parameter;
  query?: string;
}

export const fetchQuestionParameterValues =
  ({ question, parameter, query }: FetchParameterValuesOpts) =>
  async () => {
    const apiArgs = { cardId: question.id(), paramId: parameter.id, query };

    const { values, has_more_values } = query
      ? await CardApi.parameterSearch(apiArgs)
      : await CardApi.parameterValues(apiArgs);

    return {
      results: values.map((value: any) => [].concat(value)),
      has_more_values: query ? true : has_more_values,
    };
  };
