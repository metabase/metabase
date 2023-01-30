import { CardApi } from "metabase/services";
import { Parameter } from "metabase-types/api";
import Question from "metabase-lib/Question";

interface FetchQuestionParameterValuesOpts {
  question: Question;
  parameter: Parameter;
  query?: string;
}

export const fetchQuestionParameterValues =
  ({ question, parameter, query }: FetchQuestionParameterValuesOpts) =>
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
