import { ParameterApi } from "metabase/services";
import { getNonVirtualFields } from "metabase-lib/v1/parameters/utils/parameter-fields";
import { normalizeParameter } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { FieldId, Parameter, ParameterValues } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

import { getParameterValuesCache } from "./selectors";

export const FETCH_PARAMETER_VALUES =
  "metabase/parameters/FETCH_PARAMETER_VALUES";

export interface FetchParameterValuesOpts {
  parameter: Parameter;
  query?: string;
}

export interface FetchParameterValuesPayload {
  requestKey: string;
  response: ParameterValues;
}

export const fetchParameterValues =
  ({ parameter, query }: FetchParameterValuesOpts) =>
  (dispatch: Dispatch, getState: GetState) => {
    const request = {
      parameter: normalizeParameter(parameter),
      field_ids: getNonVirtualFields(parameter).map((field) =>
        Number(field.id),
      ),
      query,
    };

    return fetchParameterValuesWithCache(
      request,
      loadParameterValues,
      dispatch,
      getState,
    );
  };

interface ParameterValuesRequest {
  parameter: Parameter;
  field_ids: FieldId[];
  query?: string;
}

const loadParameterValues = async (request: ParameterValuesRequest) => {
  const { values, has_more_values } = request.query
    ? await ParameterApi.parameterSearch(request)
    : await ParameterApi.parameterValues(request);

  return {
    values: values,
    has_more_values: request.query ? true : has_more_values,
  };
};

const fetchParameterValuesWithCache = async <T>(
  request: T,
  loadValues: (request: T) => Promise<ParameterValues>,
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
