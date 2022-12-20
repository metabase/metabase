import { assoc } from "icepick";
import _ from "underscore";

import { createAction, createThunkAction } from "metabase/lib/redux";

import {
  createParameter,
  setParameterName as setParamName,
  getFilteringParameterValuesMap,
  getParameterValuesSearchKey,
} from "metabase/parameters/utils/dashboards";
import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-values";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";

import { DashboardApi } from "metabase/services";

import { getMetadata } from "metabase/selectors/metadata";
import {
  getDashboard,
  getParameterValues,
  getDashboardParameterValuesSearchCache,
  getDashboardParameterValuesCache,
  getParameters,
} from "../selectors";

import { isVirtualDashCard } from "../utils";

import { setDashboardAttributes, setDashCardAttributes } from "./core";
import { setSidebar, closeSidebar } from "./ui";

function updateParameter(dispatch, getState, id, parameterUpdater) {
  const dashboard = getDashboard(getState());
  const index = _.findIndex(
    dashboard && dashboard.parameters,
    p => p.id === id,
  );
  if (index >= 0) {
    const parameters = assoc(
      dashboard.parameters,
      index,
      parameterUpdater(dashboard.parameters[index]),
    );
    dispatch(
      setDashboardAttributes({ id: dashboard.id, attributes: { parameters } }),
    );
  }
}

function updateParameters(dispatch, getState, parametersUpdater) {
  const dashboard = getDashboard(getState());
  if (dashboard) {
    const parameters = parametersUpdater(dashboard.parameters || []);
    dispatch(
      setDashboardAttributes({ id: dashboard.id, attributes: { parameters } }),
    );
  }
}

export const setEditingParameter = parameterId => dispatch => {
  if (parameterId != null) {
    dispatch(
      setSidebar({
        name: SIDEBAR_NAME.editParameter,
        props: {
          parameterId,
        },
      }),
    );
  } else {
    dispatch(closeSidebar());
  }
};

export const ADD_PARAMETER = "metabase/dashboard/ADD_PARAMETER";
export const addParameter = createThunkAction(
  ADD_PARAMETER,
  parameterOption => (dispatch, getState) => {
    let parameter;
    updateParameters(dispatch, getState, parameters => {
      parameter = createParameter(parameterOption, parameters);
      return parameters.concat(parameter);
    });

    dispatch(
      setSidebar({
        name: SIDEBAR_NAME.editParameter,
        props: {
          parameterId: parameter.id,
        },
      }),
    );
  },
);

export const REMOVE_PARAMETER = "metabase/dashboard/REMOVE_PARAMETER";
export const removeParameter = createThunkAction(
  REMOVE_PARAMETER,
  parameterId => (dispatch, getState) => {
    updateParameters(dispatch, getState, parameters =>
      parameters.filter(p => p.id !== parameterId),
    );
  },
);

export const SET_PARAMETER_MAPPING = "metabase/dashboard/SET_PARAMETER_MAPPING";
export const setParameterMapping = createThunkAction(
  SET_PARAMETER_MAPPING,
  (parameter_id, dashcard_id, card_id, target) => (dispatch, getState) => {
    const dashcard = getState().dashboard.dashcards[dashcard_id];
    const isVirtual = isVirtualDashCard(dashcard);
    let parameter_mappings = dashcard.parameter_mappings || [];
    parameter_mappings = parameter_mappings.filter(
      m => m.card_id !== card_id || m.parameter_id !== parameter_id,
    );
    if (target) {
      if (isVirtual) {
        // If this is a virtual (text) card, remove any existing mappings for the target, since text card variables
        // can only be mapped to a single parameter.
        parameter_mappings = parameter_mappings.filter(
          m => !_.isEqual(m.target, target),
        );
      }
      parameter_mappings = parameter_mappings.concat({
        parameter_id,
        card_id,
        target,
      });
    }
    dispatch(
      setDashCardAttributes({
        id: dashcard_id,
        attributes: { parameter_mappings },
      }),
    );
  },
);

export const SET_PARAMETER_NAME = "metabase/dashboard/SET_PARAMETER_NAME";
export const setParameterName = createThunkAction(
  SET_PARAMETER_NAME,
  (parameterId, name) => (dispatch, getState) => {
    updateParameter(dispatch, getState, parameterId, parameter =>
      setParamName(parameter, name),
    );
    return { id: parameterId, name };
  },
);

export const setParameterFilteringParameters = createThunkAction(
  SET_PARAMETER_NAME,
  (parameterId, filteringParameters) => (dispatch, getState) => {
    updateParameter(dispatch, getState, parameterId, parameter => ({
      ...parameter,
      filteringParameters,
    }));
    return { id: parameterId, filteringParameters };
  },
);

export const SET_PARAMETER_VALUE = "metabase/dashboard/SET_PARAMETER_VALUE";
export const setParameterValue = createThunkAction(
  SET_PARAMETER_VALUE,
  (parameterId, value) => (dispatch, getState) => {
    return { id: parameterId, value };
  },
);

export const SET_PARAMETER_VALUES = "metabase/dashboard/SET_PARAMETER_VALUES";
export const setParameterValues = createAction(SET_PARAMETER_VALUES);

export const SET_PARAMETER_DEFAULT_VALUE =
  "metabase/dashboard/SET_PARAMETER_DEFAULT_VALUE";
export const setParameterDefaultValue = createThunkAction(
  SET_PARAMETER_DEFAULT_VALUE,
  (parameterId, defaultValue) => (dispatch, getState) => {
    updateParameter(dispatch, getState, parameterId, parameter => ({
      ...parameter,
      default: defaultValue,
    }));
    return { id: parameterId, defaultValue };
  },
);

export const SET_PARAMETER_IS_MULTI_SELECT =
  "metabase/dashboard/SET_PARAMETER_DEFAULT_VALUE";
export const setParameterIsMultiSelect = createThunkAction(
  SET_PARAMETER_DEFAULT_VALUE,
  (parameterId, isMultiSelect) => (dispatch, getState) => {
    updateParameter(dispatch, getState, parameterId, parameter => ({
      ...parameter,
      isMultiSelect: isMultiSelect,
    }));
    return { id: parameterId, isMultiSelect };
  },
);

export const SET_PARAMETER_INDEX = "metabase/dashboard/SET_PARAMETER_INDEX";
export const setParameterIndex = createThunkAction(
  SET_PARAMETER_INDEX,
  (parameterId, index) => (dispatch, getState) => {
    const dashboard = getDashboard(getState());
    const parameterIndex = _.findIndex(
      dashboard.parameters,
      p => p.id === parameterId,
    );
    if (parameterIndex >= 0) {
      const parameters = dashboard.parameters.slice();
      parameters.splice(index, 0, parameters.splice(parameterIndex, 1)[0]);
      dispatch(
        setDashboardAttributes({
          id: dashboard.id,
          attributes: { parameters },
        }),
      );
    }
    return { id: parameterId, index };
  },
);

export const SHOW_ADD_PARAMETER_POPOVER =
  "metabase/dashboard/SHOW_ADD_PARAMETER_POPOVER";

export const showAddParameterPopover = createAction(SHOW_ADD_PARAMETER_POPOVER);

export const HIDE_ADD_PARAMETER_POPOVER =
  "metabase/dashboard/HIDE_ADD_PARAMETER_POPOVER";
export const hideAddParameterPopover = createAction(HIDE_ADD_PARAMETER_POPOVER);

export const FETCH_DASHBOARD_PARAMETER_FIELD_VALUES_WITH_CACHE =
  "metabase/dashboard/FETCH_DASHBOARD_PARAMETER_FIELD_VALUES_WITH_CACHE";

export const fetchDashboardParameterValuesWithCache = createThunkAction(
  FETCH_DASHBOARD_PARAMETER_FIELD_VALUES_WITH_CACHE,
  ({ dashboardId, parameter, parameters, query }) =>
    async (dispatch, getState) => {
      const parameterValuesSearchCache = getDashboardParameterValuesSearchCache(
        getState(),
      );
      const filteringParameterValues = getFilteringParameterValuesMap(
        parameter,
        parameters,
      );
      const cacheKey = getParameterValuesSearchKey({
        dashboardId,
        parameterId: parameter.id,
        query,
        filteringParameterValues,
      });

      if (parameterValuesSearchCache[cacheKey]) {
        return;
      }

      const endpoint = query
        ? DashboardApi.parameterSearch
        : DashboardApi.parameterValues;
      const { values, has_more_values } = await endpoint({
        paramId: parameter.id,
        dashId: dashboardId,
        query,
        ...filteringParameterValues,
      });

      return {
        cacheKey,
        results: values.map(value => [].concat(value)),
        has_more_values: query ? true : has_more_values,
      };
    },
);

export const fetchDashboardParameterValues =
  args => async (dispatch, getState) => {
    await dispatch(fetchDashboardParameterValuesWithCache(args));
    const dashboardParameterValuesCache = getDashboardParameterValuesCache(
      getState(),
    );
    return dashboardParameterValuesCache.get(args) || [];
  };

export const setOrUnsetParameterValues =
  parameterIdValuePairs => (dispatch, getState) => {
    const parameterValues = getParameterValues(getState());
    parameterIdValuePairs
      .map(([id, value]) =>
        setParameterValue(id, value === parameterValues[id] ? null : value),
      )
      .forEach(dispatch);
  };

export const setParameterValuesFromQueryParams =
  queryParams => (dispatch, getState) => {
    const parameters = getParameters(getState());
    const metadata = getMetadata(getState());
    const parameterValues = getParameterValuesByIdFromQueryParams(
      parameters,
      queryParams,
      metadata,
      { forcefullyUnsetDefaultedParametersWithEmptyStringValue: true },
    );

    dispatch(setParameterValues(parameterValues));
  };
