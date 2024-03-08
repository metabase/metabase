import { assoc } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import { autoWireDashcardsWithMatchingParameters } from "metabase/dashboard/actions/auto-wire-parameters/actions";
import { closeAutoWireParameterToast } from "metabase/dashboard/actions/auto-wire-parameters/toasts";
import { getParameterMappings } from "metabase/dashboard/actions/auto-wire-parameters/utils";
import { updateDashboard } from "metabase/dashboard/actions/save";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { createAction, createThunkAction } from "metabase/lib/redux";
import {
  createParameter,
  setParameterName as setParamName,
} from "metabase/parameters/utils/dashboards";
import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-values";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import {
  isParameterValueEmpty,
  PULSE_PARAM_EMPTY,
} from "metabase-lib/parameters/utils/parameter-values";
import type {
  ActionDashboardCard,
  CardId,
  DashCardId,
  Parameter,
  ParameterId,
  ParameterMappingOptions,
  ParameterTarget,
  QuestionDashboardCard,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
  WritebackAction,
} from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

import {
  trackAutoApplyFiltersDisabled,
  trackFilterRequired,
} from "../analytics";
import {
  getAutoApplyFiltersToastId,
  getDashboard,
  getDashboardId,
  getDashCardById,
  getDraftParameterValues,
  getIsAutoApplyFilters,
  getParameters,
  getParameterValues,
} from "../selectors";
import { isQuestionDashCard } from "../utils";

import { setDashboardAttributes, setDashCardAttributes } from "./core";
import { closeSidebar, setSidebar } from "./ui";

type SingleParamUpdater = (p: Parameter) => Parameter;

function updateParameter(
  dispatch: Dispatch,
  getState: GetState,
  id: ParameterId,
  parameterUpdater: SingleParamUpdater,
) {
  const dashboard = getDashboard(getState());
  if (!dashboard || !dashboard.parameters) {
    return;
  }

  const index = _.findIndex(dashboard.parameters, p => p.id === id);
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

type MultipleParamUpdater = (p: Parameter[]) => Parameter[];

function updateParameters(
  dispatch: Dispatch,
  getState: GetState,
  parametersUpdater: MultipleParamUpdater,
) {
  const dashboard = getDashboard(getState());
  if (dashboard) {
    const parameters = parametersUpdater(dashboard.parameters || []);
    dispatch(
      setDashboardAttributes({ id: dashboard.id, attributes: { parameters } }),
    );
  }
}

export const setEditingParameter =
  (parameterId: ParameterId) => (dispatch: Dispatch) => {
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
  (option: ParameterMappingOptions) => (dispatch, getState) => {
    let newId: undefined | ParameterId = undefined;

    updateParameters(dispatch, getState, parameters => {
      const parameter = createParameter(option, parameters);
      newId = parameter.id;
      return [...parameters, parameter];
    });

    if (newId) {
      dispatch(
        setSidebar({
          name: SIDEBAR_NAME.editParameter,
          props: {
            parameterId: newId,
          },
        }),
      );
    }
  },
);

export const REMOVE_PARAMETER = "metabase/dashboard/REMOVE_PARAMETER";
export const removeParameter = createThunkAction(
  REMOVE_PARAMETER,
  (parameterId: ParameterId) => (dispatch, getState) => {
    updateParameters(dispatch, getState, parameters =>
      parameters.filter(p => p.id !== parameterId),
    );
    return { id: parameterId };
  },
);

export const SET_PARAMETER_MAPPING = "metabase/dashboard/SET_PARAMETER_MAPPING";

export const setParameterMapping = createThunkAction(
  SET_PARAMETER_MAPPING,
  (
    parameterId: ParameterId,
    dashcardId: DashCardId,
    cardId: CardId,
    target: ParameterTarget | null,
  ) => {
    return (dispatch, getState) => {
      dispatch(closeAutoWireParameterToast());

      const dashcard = getDashCardById(getState(), dashcardId);

      if (target !== null && isQuestionDashCard(dashcard)) {
        dispatch(
          autoWireDashcardsWithMatchingParameters(
            parameterId,
            dashcard,
            target,
          ),
        );
      }

      dispatch(
        setDashCardAttributes({
          id: dashcardId,
          attributes: {
            parameter_mappings: getParameterMappings(
              // TODO remove type casting when getParameterMappings is fixed
              dashcard as QuestionDashboardCard,
              parameterId,
              cardId,
              target,
            ),
          },
        }),
      );
    };
  },
);

export const SET_ACTION_FOR_DASHCARD =
  "metabase/dashboard/SET_ACTION_FOR_DASHCARD";
export const setActionForDashcard = createThunkAction(
  SET_PARAMETER_MAPPING,
  (dashcard: ActionDashboardCard, newAction: WritebackAction) => dispatch => {
    dispatch(
      setDashCardAttributes({
        id: dashcard.id,
        attributes: {
          action_id: newAction.id,
          action: newAction,
        },
      }),
    );
  },
);

export const SET_PARAMETER_NAME = "metabase/dashboard/SET_PARAMETER_NAME";
export const setParameterName = createThunkAction(
  SET_PARAMETER_NAME,
  (parameterId: ParameterId, name: string) => (dispatch, getState) => {
    updateParameter(dispatch, getState, parameterId, parameter =>
      setParamName(parameter, name),
    );
    return { id: parameterId, name };
  },
);

export const setParameterFilteringParameters = createThunkAction(
  SET_PARAMETER_NAME,
  (parameterId: ParameterId, filteringParameters: ParameterId[]) =>
    (dispatch, getState) => {
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
  (parameterId: ParameterId, value: any) => (_dispatch, getState) => {
    const isSettingDraftParameterValues = !getIsAutoApplyFilters(getState());

    return {
      id: parameterId,
      value: isParameterValueEmpty(value) ? PULSE_PARAM_EMPTY : value,
      isDraft: isSettingDraftParameterValues,
    };
  },
);

export const SET_PARAMETER_VALUES = "metabase/dashboard/SET_PARAMETER_VALUES";
export const setParameterValues = createAction(SET_PARAMETER_VALUES);

// Auto-apply filters
const APPLY_DRAFT_PARAMETER_VALUES =
  "metabase/dashboard/APPLY_DRAFT_PARAMETER_VALUES";
export const applyDraftParameterValues = createThunkAction(
  APPLY_DRAFT_PARAMETER_VALUES,
  () => (dispatch, getState) => {
    const draftParameterValues = getDraftParameterValues(getState());
    dispatch(setParameterValues(draftParameterValues));
  },
);

export const SET_PARAMETER_DEFAULT_VALUE =
  "metabase/dashboard/SET_PARAMETER_DEFAULT_VALUE";
export const setParameterDefaultValue = createThunkAction(
  SET_PARAMETER_DEFAULT_VALUE,
  (parameterId: ParameterId, defaultValue: any) => (dispatch, getState) => {
    updateParameter(dispatch, getState, parameterId, parameter => ({
      ...parameter,
      default: defaultValue,
    }));
    return { id: parameterId, defaultValue };
  },
);

export const SET_PARAMETER_VALUE_TO_DEFAULT =
  "metabase/dashboard/SET_PARAMETER_VALUE_TO_DEFAULT";
export const setParameterValueToDefault = createThunkAction(
  SET_PARAMETER_VALUE_TO_DEFAULT,
  (parameterId: ParameterId) => (dispatch, getState) => {
    const parameter = getParameters(getState()).find(
      ({ id }) => id === parameterId,
    );
    const defaultValue = parameter?.default;
    if (defaultValue) {
      dispatch(setParameterValue(parameterId, defaultValue));
    }
  },
);

export const SET_PARAMETER_REQUIRED =
  "metabase/dashboard/SET_PARAMETER_REQUIRED";
export const setParameterRequired = createThunkAction(
  SET_PARAMETER_REQUIRED,
  (parameterId: ParameterId, required: boolean) => (dispatch, getState) => {
    const parameter = getParameters(getState()).find(
      ({ id }) => id === parameterId,
    );

    if (parameter && parameter.required !== required) {
      updateParameter(dispatch, getState, parameterId, parameter => ({
        ...parameter,
        required,
      }));
    }

    if (required) {
      const dashboardId = getDashboardId(getState());
      if (dashboardId) {
        trackFilterRequired(dashboardId);
      }
    }
  },
);

export const SET_PARAMETER_IS_MULTI_SELECT =
  "metabase/dashboard/SET_PARAMETER_DEFAULT_VALUE";
export const setParameterIsMultiSelect = createThunkAction(
  SET_PARAMETER_IS_MULTI_SELECT,
  (parameterId: ParameterId, isMultiSelect: boolean) => (dispatch, getState) => {
    updateParameter(dispatch, getState, parameterId, parameter => ({
      ...parameter,
      isMultiSelect: isMultiSelect,
    }));
    return { id: parameterId, isMultiSelect };
  },
);

export const SET_PARAMETER_QUERY_TYPE =
  "metabase/dashboard/SET_PARAMETER_QUERY_TYPE";
export const setParameterQueryType = createThunkAction(
  SET_PARAMETER_QUERY_TYPE,
  (parameterId: ParameterId, queryType: ValuesQueryType) =>
    (dispatch, getState) => {
      updateParameter(dispatch, getState, parameterId, parameter => ({
        ...parameter,
        values_query_type: queryType,
      }));
      return { id: parameterId, queryType };
    },
);

export const SET_PARAMETER_SOURCE_TYPE =
  "metabase/dashboard/SET_PARAMETER_SOURCE_TYPE";
export const setParameterSourceType = createThunkAction(
  SET_PARAMETER_SOURCE_TYPE,
  (parameterId: ParameterId, sourceType: ValuesSourceType) =>
    (dispatch, getState) => {
      updateParameter(dispatch, getState, parameterId, parameter => ({
        ...parameter,
        values_source_type: sourceType,
      }));
      return { id: parameterId, sourceType };
    },
);

export const SET_PARAMETER_SOURCE_CONFIG =
  "metabase/dashboard/SET_PARAMETER_SOURCE_CONFIG";
export const setParameterSourceConfig = createThunkAction(
  SET_PARAMETER_SOURCE_CONFIG,
  (parameterId: ParameterId, sourceConfig: ValuesSourceConfig) =>
    (dispatch, getState) => {
      updateParameter(dispatch, getState, parameterId, parameter => ({
        ...parameter,
        values_source_config: sourceConfig,
      }));
      return { id: parameterId, sourceConfig };
    },
);

export const SET_PARAMETER_INDEX = "metabase/dashboard/SET_PARAMETER_INDEX";
export const setParameterIndex = createThunkAction(
  SET_PARAMETER_INDEX,
  (parameterId: ParameterId, index: number) => (dispatch, getState) => {
    const dashboard = getDashboard(getState());

    if (!dashboard || !dashboard.parameters) {
      return;
    }

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

export const setOrUnsetParameterValues =
  (parameterIdValuePairs: any[][]) =>
  (dispatch: Dispatch, getState: GetState) => {
    const parameterValues = getParameterValues(getState());
    parameterIdValuePairs
      .map(([id, value]) =>
        setParameterValue(id, value === parameterValues[id] ? null : value),
      )
      .forEach(dispatch);
  };

export const setParameterValuesFromQueryParams =
  (queryParams: Record<string, string | string[]>) =>
  (dispatch: Dispatch, getState: GetState) => {
    const parameters = getParameters(getState());
    const parameterValues = getParameterValuesByIdFromQueryParams(
      parameters,
      queryParams,
    );

    dispatch(setParameterValues(parameterValues));
  };

export const TOGGLE_AUTO_APPLY_FILTERS =
  "metabase/dashboard/TOGGLE_AUTO_APPLY_FILTERS";
export const toggleAutoApplyFilters = createThunkAction(
  TOGGLE_AUTO_APPLY_FILTERS,
  (isEnabled: boolean) => (dispatch, getState) => {
    const dashboardId = getDashboardId(getState());

    if (dashboardId) {
      dispatch(applyDraftParameterValues());
      dispatch(
        setDashboardAttributes({
          id: dashboardId,
          attributes: { auto_apply_filters: isEnabled },
        }),
      );
      dispatch(updateDashboard({ attributeNames: ["auto_apply_filters"] }));
      if (!isEnabled) {
        trackAutoApplyFiltersDisabled(dashboardId);
      }
    }
  },
);

export const SHOW_AUTO_APPLY_FILTERS_TOAST =
  "metabase/dashboard/SHOW_AUTO_APPLY_FILTERS_TOAST";
export const showAutoApplyFiltersToast = createThunkAction(
  SHOW_AUTO_APPLY_FILTERS_TOAST,
  () => (dispatch, getState) => {
    const action = toggleAutoApplyFilters(false);
    const toastId = _.uniqueId();
    const dashboardId = getDashboardId(getState());

    dispatch(
      addUndo({
        id: toastId,
        icon: null,
        timeout: null,
        message: t`You can make this dashboard snappier by turning off auto-applying filters.`,
        action,
        actionLabel: t`Turn off`,
      }),
    );

    return { toastId, dashboardId };
  },
);

export const CLOSE_AUTO_APPLY_FILTERS_TOAST =
  "metabase/dashboard/CLOSE_AUTO_APPLY_FILTERS_TOAST";
export const closeAutoApplyFiltersToast = createThunkAction(
  CLOSE_AUTO_APPLY_FILTERS_TOAST,
  () => (dispatch, getState) => {
    const toastId = getAutoApplyFiltersToastId(getState());
    if (toastId) {
      dispatch(dismissUndo(toastId, false));
    }
  },
);
