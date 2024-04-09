import { CardApi, DashboardApi, ParameterApi } from "metabase/services";
import { getNonVirtualFields } from "metabase-lib/v1/parameters/utils/parameter-fields";
import { normalizeParameter } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  CardId,
  DashboardId,
  FieldId,
  Parameter,
  ParameterId,
  ParameterValues,
} from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

import { getParameterValuesCache } from "./selectors";
import { getFilteringParameterValuesMap } from "./utils/dashboards";

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

export interface FetchCardParameterValuesOpts {
  cardId: CardId;
  parameter: Parameter;
  query?: string;
}

export const fetchCardParameterValues =
  ({ cardId, parameter, query }: FetchCardParameterValuesOpts) =>
  (dispatch: Dispatch, getState: GetState) => {
    const request = {
      cardId,
      paramId: parameter.id,
      query,
    };

    return fetchParameterValuesWithCache(
      request,
      loadCardParameterValues,
      dispatch,
      getState,
    );
  };

export interface FetchDashboardParameterValuesOpts {
  dashboardId: DashboardId;
  parameter: Parameter;
  parameters: Parameter[];
  query?: string;
}

export const fetchDashboardParameterValues =
  ({
    dashboardId,
    parameter,
    parameters,
    query,
  }: FetchDashboardParameterValuesOpts) =>
  (dispatch: Dispatch, getState: GetState) => {
    const request = {
      paramId: parameter.id,
      dashId: dashboardId,
      query,
      ...getFilteringParameterValuesMap(parameter, parameters),
    };

    return fetchParameterValuesWithCache(
      request,
      loadDashboardParameterValues,
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

interface CardParameterValuesRequest {
  cardId: CardId;
  paramId: ParameterId;
  query?: string;
}

const loadCardParameterValues = async (request: CardParameterValuesRequest) => {
  const { values, has_more_values } = request.query
    ? await CardApi.parameterSearch(request)
    : await CardApi.parameterValues(request);

  return {
    values: values,
    has_more_values: request.query ? true : has_more_values,
  };
};

interface DashboardParameterValuesRequest {
  dashId: DashboardId;
  paramId: ParameterId;
  query?: string;
}

const loadDashboardParameterValues = async (
  request: DashboardParameterValuesRequest,
) => {
  const { values, has_more_values } = request.query
    ? await DashboardApi.parameterSearch(request)
    : await DashboardApi.parameterValues(request);

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
