import { CardApi, ParameterApi } from "metabase/services";
import { Parameter } from "metabase-types/api";
import Question from "metabase-lib/Question";
import { getFields } from "metabase-lib/parameters/utils/parameter-fields";

interface FetchParameterValuesOpts {
  parameter: Parameter;
  query?: string;
}

export const fetchParameterValues =
  ({ parameter, query }: FetchParameterValuesOpts) =>
  async () => {
    const { id, values_source_type, values_source_config } = parameter;
    const fields = getFields(parameter).map(field => field.reference());
    const args = { id, fields, values_source_type, values_source_config };

    const { values, has_more_values } = query
      ? await ParameterApi.parameterSearch(args)
      : await ParameterApi.parameterValues(args);

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
    const args = { cardId: question.id(), paramId: parameter.id, query };

    const { values, has_more_values } = query
      ? await CardApi.parameterSearch(args)
      : await CardApi.parameterValues(args);

    return {
      results: values.map((value: any) => [].concat(value)),
      has_more_values: query ? true : has_more_values,
    };
  };
