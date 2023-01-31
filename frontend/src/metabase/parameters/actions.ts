import { CardApi, ParameterApi } from "metabase/services";
import { Parameter } from "metabase-types/api";
import Question from "metabase-lib/Question";
import { getNonVirtualFields } from "metabase-lib/parameters/utils/parameter-fields";
import { normalizeParameter } from "metabase-lib/parameters/utils/parameter-values";

interface FetchParameterValuesOpts {
  parameter: Parameter;
  query?: string;
}

export const fetchParameterValues =
  ({ parameter, query }: FetchParameterValuesOpts) =>
  async () => {
    const apiArgs = {
      parameter: normalizeParameter(parameter),
      field_ids: getNonVirtualFields(parameter).map(field => field.id),
      query,
    };

    const { values, has_more_values } = query
      ? await ParameterApi.parameterSearch(apiArgs)
      : await ParameterApi.parameterValues(apiArgs);

    return {
      results: values.map((value: any) => [].concat(value)),
      has_more_values: query ? true : has_more_values,
    };
  };

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
