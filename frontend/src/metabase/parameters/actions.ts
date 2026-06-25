import { cardApi, dashboardApi, parametersApi } from "metabase/api";
import type {
  CardParameterValuesRequest,
  SearchCardParameterValuesRequest,
} from "metabase/api/card";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import type { DispatchFn } from "metabase/redux";
import type { GetState } from "metabase/redux/store";
import { stableStringify } from "metabase/utils/objects";
import { getNonVirtualFields } from "metabase-lib/v1/parameters/utils/parameter-fields";
import { normalizeParameter } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  CardId,
  DashboardId,
  DashboardParameterValuesRequest,
  FieldId,
  Parameter,
  ParameterValues,
  SearchDashboardParameterValuesRequest,
} from "metabase-types/api";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";

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
  (dispatch: DispatchFn, getState: GetState) => {
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
  (dispatch: DispatchFn, getState: GetState) => {
    const baseRequest: CardParameterValuesRequest = {
      ...(entityIdentifier ? { entityIdentifier } : { cardId }),
      paramId: parameter.id,
    };
    const request:
      | SearchCardParameterValuesRequest
      | CardParameterValuesRequest = query
      ? { ...baseRequest, query }
      : baseRequest;

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
  (dispatch: DispatchFn, getState: GetState) => {
    const baseRequest: DashboardParameterValuesRequest = {
      ...(entityIdentifier ? { entityIdentifier } : { dashId: dashboardId }),
      paramId: parameter.id,
      ...getFilteringParameterValuesMap(parameter, parameters),
    };
    const request:
      | DashboardParameterValuesRequest
      | SearchDashboardParameterValuesRequest = query
      ? { ...baseRequest, query }
      : baseRequest;

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

const loadParameterValues = async (
  request: ParameterValuesRequest,
  dispatch: DispatchFn,
) => {
  const { values, has_more_values } = await runRtkEndpoint(
    request,
    dispatch,
    request.query
      ? parametersApi.endpoints.searchParameterValues
      : parametersApi.endpoints.getParameterValues,
  );

  return {
    values: values,
    has_more_values: request.query ? true : has_more_values,
  };
};

const loadCardParameterValues = async (
  request: CardParameterValuesRequest | SearchCardParameterValuesRequest,
  dispatch: DispatchFn,
) => {
  const isSearch = "query" in request && request.query;
  // `fetchParameterValuesWithCache` already provides caching keyed on the full
  // request and is cleared on `API_UPDATE_QUESTION`; bypass RTK's own cache so
  // a refetch after that reset actually hits the network.
  const queryAction = dispatch(
    isSearch
      ? cardApi.endpoints.searchCardParameterValues.initiate(
          request as SearchCardParameterValuesRequest,
          { forceRefetch: true },
        )
      : cardApi.endpoints.getCardParameterValues.initiate(request, {
          forceRefetch: true,
        }),
  );
  try {
    const { values, has_more_values } = await queryAction.unwrap();
    return {
      values,
      has_more_values: isSearch ? true : has_more_values,
    };
  } finally {
    queryAction.unsubscribe?.();
  }
};

const loadDashboardParameterValues = async (
  request:
    | DashboardParameterValuesRequest
    | SearchDashboardParameterValuesRequest,
  dispatch: DispatchFn,
) => {
  const isSearch = "query" in request && request.query;
  // `fetchParameterValuesWithCache` already provides caching keyed on the full
  // request; bypass RTK's own cache so a refetch actually hits the network.
  const queryAction = dispatch(
    isSearch
      ? dashboardApi.endpoints.searchDashboardParameterValues.initiate(
          request as SearchDashboardParameterValuesRequest,
          { forceRefetch: true },
        )
      : dashboardApi.endpoints.getDashboardParameterValues.initiate(request, {
          forceRefetch: true,
        }),
  );
  try {
    const { values, has_more_values } = await queryAction.unwrap();
    return {
      values,
      has_more_values: isSearch ? true : has_more_values,
    };
  } finally {
    queryAction.unsubscribe?.();
  }
};

const fetchParameterValuesWithCache = async <T>(
  request: T,
  loadValues: (request: T, dispatch: DispatchFn) => Promise<ParameterValues>,
  dispatch: DispatchFn,
  getState: GetState,
) => {
  const requestKey = stableStringify(request);
  const requestCache = getParameterValuesCache(getState());
  const response = requestCache[requestKey]
    ? requestCache[requestKey]
    : await loadValues(request, dispatch);

  const payload = { requestKey, response };
  dispatch({ type: FETCH_PARAMETER_VALUES, payload });
  return response;
};
