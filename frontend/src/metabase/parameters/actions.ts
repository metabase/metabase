import { CardApi, ParameterApi } from "metabase/services";
import {
  Parameter,
  ParameterValuesRequest,
  ParameterValuesResponse,
  QuestionParameterValuesRequest,
} from "metabase-types/api";
import { Dispatch, GetState } from "metabase-types/store";
import Question from "metabase-lib/Question";
import { getNonVirtualFields } from "metabase-lib/parameters/utils/parameter-fields";
import { normalizeParameter } from "metabase-lib/parameters/utils/parameter-values";
import { getParameterValuesCache } from "./selectors";

export const FETCH_PARAMETER_VALUES =
  "metabase/parameters/FETCH_PARAMETER_VALUES";

interface FetchParameterValuesOpts {
  parameter: Parameter;
  query?: string;
}

export interface FetchParameterValuesPayload {
  requestKey: string;
  response: ParameterValuesResponse;
}

export const fetchParameterValues =
  ({ parameter, query }: FetchParameterValuesOpts) =>
  (dispatch: Dispatch, getState: GetState) => {
    const request = {
      parameter: normalizeParameter(parameter),
      field_ids: getNonVirtualFields(parameter).map(field => Number(field.id)),
      query,
    };

    return fetchParameterValuesWithCache(
      request,
      loadParameterValues,
      dispatch,
      getState,
    );
  };

export interface FetchQuestionParameterValuesOpts {
  question: Question;
  parameter: Parameter;
  query?: string;
}

export const fetchQuestionParameterValues =
  ({ question, parameter, query }: FetchQuestionParameterValuesOpts) =>
  (dispatch: Dispatch, getState: GetState) => {
    const request = {
      cardId: question.id(),
      paramId: parameter.id,
      query,
    };

    return fetchParameterValuesWithCache(
      request,
      loadQuestionParameterValues,
      dispatch,
      getState,
    );
  };

const loadParameterValues = async (request: ParameterValuesRequest) => {
  const { values, has_more_values } = request.query
    ? await ParameterApi.parameterSearch(request)
    : await ParameterApi.parameterValues(request);

  return {
    values: values.map((value: any) => [].concat(value)),
    has_more_values: request.query ? true : has_more_values,
  };
};

const loadQuestionParameterValues = async (
  request: QuestionParameterValuesRequest,
) => {
  const { values, has_more_values } = request.query
    ? await CardApi.parameterSearch(request)
    : await CardApi.parameterValues(request);

  return {
    values: values.map((value: any) => [].concat(value)),
    has_more_values: request.query ? true : has_more_values,
  };
};

const fetchParameterValuesWithCache = async <T>(
  request: T,
  loadValues: (request: T) => Promise<ParameterValuesResponse>,
  dispatch: Dispatch,
  getState: GetState,
) => {
  const requestKey = JSON.stringify(request);
  const requestCache = getParameterValuesCache(getState());
  const response = requestCache[requestKey]
    ? requestCache[requestKey]
    : await loadValues(request);

  const payload = { requestKey, response };
  dispatch({ type: FETCH_PARAMETER_VALUES, payload });
  return response;
};
