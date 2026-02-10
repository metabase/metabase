import { stableStringify } from "metabase/lib/objects";
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
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";
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

export interface FetchCardParameterValuesOpts {
  cardId: CardId;
  entityIdentifier: EntityUuid | EntityToken | null;
  parameter: Parameter;
  query?: string;
}

export const fetchCardParameterValues =
  ({
    cardId,
    entityIdentifier,
    parameter,
    query,
  }: FetchCardParameterValuesOpts) =>
  (dispatch: Dispatch, getState: GetState) => {
    const request: CardParameterValuesRequest = {
      ...(entityIdentifier ? { entityIdentifier } : { cardId }),
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
  entityIdentifier: EntityUuid | EntityToken | null;
  parameter: Parameter;
  parameters: Parameter[];
  query?: string;
}

export const fetchDashboardParameterValues =
  ({
    dashboardId,
    entityIdentifier,
    parameter,
    parameters,
    query,
  }: FetchDashboardParameterValuesOpts) =>
  (dispatch: Dispatch, getState: GetState) => {
    const request: DashboardParameterValuesRequest = {
      ...(entityIdentifier ? { entityIdentifier } : { dashId: dashboardId }),
      paramId: parameter.id,
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
  const { values, has_more_values } = (
    request.query
      ? await ParameterApi.parameterSearch(request)
      : await ParameterApi.parameterValues(request)
  ) as ParameterValues;

  return {
    values: values,
    has_more_values: request.query ? true : has_more_values,
  };
};

interface CardParameterValuesRequest {
  cardId?: CardId;
  entityIdentifier?: EntityUuid | EntityToken | null;
  paramId: ParameterId;
  query?: string;
}

const loadCardParameterValues = async (request: CardParameterValuesRequest) => {
  const { values, has_more_values } = (
    request.query
      ? await CardApi.parameterSearch(request)
      : await CardApi.parameterValues(request)
  ) as ParameterValues;

  return {
    values: values,
    has_more_values: request.query ? true : has_more_values,
  };
};

interface DashboardParameterValuesRequest {
  dashId?: DashboardId;
  entityIdentifier?: EntityUuid | EntityToken | null;
  paramId: ParameterId;
  query?: string;
}

const loadDashboardParameterValues = async (
  request: DashboardParameterValuesRequest,
) => {
  const { values, has_more_values } = (
    request.query
      ? await DashboardApi.parameterSearch(request)
      : await DashboardApi.parameterValues(request)
  ) as ParameterValues;

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
  const requestKey = stableStringify(request);
  const requestCache = getParameterValuesCache(getState());
  const response = requestCache[requestKey]
    ? requestCache[requestKey]
    : await loadValues(request);

  const payload = { requestKey, response };
  dispatch({ type: FETCH_PARAMETER_VALUES, payload });
  return response;
};
