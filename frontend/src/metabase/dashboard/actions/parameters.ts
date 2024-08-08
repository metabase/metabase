import { assoc } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import { showAutoWireToast } from "metabase/dashboard/actions/auto-wire-parameters/actions";
import {
  closeAutoWireParameterToast,
  closeAddCardAutoWireToasts,
} from "metabase/dashboard/actions/auto-wire-parameters/toasts";
import { getParameterMappings } from "metabase/dashboard/actions/auto-wire-parameters/utils";
import { updateDashboard } from "metabase/dashboard/actions/save";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { createAction, createThunkAction } from "metabase/lib/redux";
import {
  createParameter,
  setParameterName as setParamName,
  setParameterType as setParamType,
} from "metabase/parameters/utils/dashboards";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import { buildTemporalUnitOption } from "metabase-lib/v1/parameters/utils/operators";
import { getParameterValuesByIdFromQueryParams } from "metabase-lib/v1/parameters/utils/parameter-parsing";
import {
  isParameterValueEmpty,
  PULSE_PARAM_EMPTY,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  ActionDashboardCard,
  CardId,
  DashCardId,
  Parameter,
  ParameterId,
  ParameterMappingOptions,
  ParameterTarget,
  TemporalUnit,
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
  getDashboardBeforeEditing,
  getDashboardId,
  getDashCardById,
  getDashcards,
  getDraftParameterValues,
  getIsAutoApplyFilters,
  getParameters,
  getParameterValues,
  getParameterMappingsBeforeEditing,
  getSelectedTabId,
  getFiltersToReset,
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
  (parameterId: ParameterId | null) => (dispatch: Dispatch) => {
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

export const ADD_TEMPORAL_UNIT_PARAMETER =
  "metabase/dashboard/ADD_TEMPORAL_UNIT_PARAMETER";
export const addTemporalUnitParameter = createThunkAction(
  ADD_TEMPORAL_UNIT_PARAMETER,
  () => async dispatch => {
    await dispatch(addParameter(buildTemporalUnitOption()));
  },
);

export const REMOVE_PARAMETER = "metabase/dashboard/REMOVE_PARAMETER";
export const removeParameter = createThunkAction(
  REMOVE_PARAMETER,
  (parameterId: ParameterId) => (dispatch, getState) => {
    dispatch(closeAddCardAutoWireToasts());

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
        const selectedTabId = getSelectedTabId(getState());

        dispatch(
          showAutoWireToast(parameterId, dashcard, target, selectedTabId),
        );
      }

      dispatch(
        setDashCardAttributes({
          id: dashcardId,
          attributes: {
            parameter_mappings: getParameterMappings(
              dashcard,
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

export const RESET_PARAMETER_MAPPINGS =
  "metabase/dashboard/RESET_PARAMETER_MAPPINGS";
export const resetParameterMapping = createThunkAction(
  RESET_PARAMETER_MAPPINGS,
  (parameterId: ParameterId, dashcardId?: DashCardId) => {
    return (dispatch, getState) => {
      const dashboard = getDashboard(getState());

      if (!dashboard || !dashboard.parameters) {
        return;
      }

      const allDashcards = getDashcards(getState());

      const dashcards = dashcardId
        ? [allDashcards[dashcardId]]
        : dashboard.dashcards.map(dashcardId => allDashcards[dashcardId]);

      for (const dashcard of dashcards) {
        if (!dashcard.parameter_mappings?.length) {
          continue;
        }

        const isDashcardMappedToParameter = dashcard.parameter_mappings.some(
          mapping => mapping.parameter_id === parameterId,
        );

        if (!isDashcardMappedToParameter) {
          continue;
        }

        const parameterMappingsWithoutParameterId =
          dashcard.parameter_mappings.filter(
            mapping => mapping.parameter_id !== parameterId,
          );

        dispatch(
          setDashCardAttributes({
            id: dashcard.id,
            attributes: {
              parameter_mappings: parameterMappingsWithoutParameterId,
            },
          }),
        );
      }
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

export const SET_PARAMETER_TYPE = "metabase/dashboard/SET_PARAMETER_TYPE";
export const setParameterType = createThunkAction(
  SET_PARAMETER_TYPE,
  (parameterId: ParameterId, type: string, sectionId: string) =>
    (dispatch, getState) => {
      const parameter = getParameters(getState()).find(
        ({ id }) => id === parameterId,
      );

      if (!parameter) {
        return;
      }

      let haveRestoredParameterMappingsToPristine = false;

      if (parameter.sectionId !== sectionId) {
        // reset all mappings if type has changed,
        // operator change resets mappings in some cases as well
        dispatch(resetParameterMapping(parameterId));

        haveRestoredParameterMappingsToPristine =
          restoreParameterMappingsIfNeeded(
            getState,
            dispatch,
            parameterId,
            sectionId,
          );
      }

      if (!haveRestoredParameterMappingsToPristine) {
        // update to default
        updateParameter(dispatch, getState, parameterId, parameter =>
          setParamType(parameter, type, sectionId),
        );
      }

      restoreValueConfigIfNeeded(getState, dispatch, parameterId, sectionId);

      return { id: parameterId, type };
    },
);

function restoreParameterMappingsIfNeeded(
  getState: GetState,
  dispatch: Dispatch,
  parameterId: ParameterId,
  sectionId: string,
): boolean {
  // check here if the parameter type is pristine and if so, change operator to
  // the saved and not to default
  const dashboardBeforeEditing = getDashboardBeforeEditing(getState());

  if (!dashboardBeforeEditing) {
    return false;
  }

  const parametersBeforeEditing = dashboardBeforeEditing.parameters;
  const parameterToRestore = parametersBeforeEditing?.find(
    ({ id }) => id === parameterId,
  );

  if (!parameterToRestore) {
    return false;
  }

  if (sectionId !== parameterToRestore.sectionId) {
    return false;
  }

  // restore parameter state
  updateParameter(dispatch, getState, parameterId, () =>
    setParamType(parameterToRestore, parameterToRestore.type, sectionId),
  );

  const parameterMappingsBeforeEditing = getParameterMappingsBeforeEditing(
    getState(),
  );
  const parameterMappings = parameterMappingsBeforeEditing[parameterId];

  if (!parameterMappings) {
    return false;
  }

  // restore parameter mappings
  Object.entries(parameterMappings).forEach(([dashcardId, mappings]) => {
    const { card_id, target } = mappings;

    dispatch(
      setParameterMapping(parameterId, Number(dashcardId), card_id, target),
    );
  });

  return true;
}

function restoreValueConfigIfNeeded(
  getState: GetState,
  dispatch: Dispatch,
  parameterId: ParameterId,
  sectionId: string,
): boolean {
  const dashboardBeforeEditing = getDashboardBeforeEditing(getState());
  if (!dashboardBeforeEditing) {
    return false;
  }

  const parametersBeforeEditing = dashboardBeforeEditing.parameters;
  const parameterToRestore = parametersBeforeEditing?.find(
    ({ id }) => id === parameterId,
  );

  if (!parameterToRestore) {
    return false;
  }

  if (sectionId !== parameterToRestore.sectionId) {
    return false;
  }

  if (parameterToRestore.values_source_config) {
    dispatch(
      setParameterSourceConfig(
        parameterId,
        parameterToRestore.values_source_config,
      ),
    );
  }
  if (parameterToRestore.values_source_type) {
    dispatch(
      setParameterSourceType(
        parameterId,
        parameterToRestore.values_source_type,
      ),
    );
  }
  if (parameterToRestore.values_query_type) {
    dispatch(
      setParameterQueryType(parameterId, parameterToRestore.values_query_type),
    );
  }

  return true;
}

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
  (parameterId: ParameterId, value: unknown) => (_dispatch, getState) => {
    const isSettingDraftParameterValues = !getIsAutoApplyFilters(getState());
    const isValueEmpty = isParameterValueEmpty(value);

    return {
      id: parameterId,
      value: isValueEmpty ? PULSE_PARAM_EMPTY : value,
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

export const RESET_PARAMETERS = "metabase/dashboard/RESET_PARAMETERS";
export const resetParameters = createThunkAction(
  RESET_PARAMETERS,
  () => (_dispatch, getState) => {
    const parameters = getFiltersToReset(getState());

    return parameters.map(parameter => {
      const newValue = parameter.default ?? null;
      const isValueEmpty = isParameterValueEmpty(newValue);

      return {
        id: parameter.id,
        value: isValueEmpty ? PULSE_PARAM_EMPTY : newValue,
      };
    });
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
      default:
        !isMultiSelect &&
        Array.isArray(parameter.default) &&
        parameter.default.length > 1
          ? [parameter.default[0]]
          : parameter.default,
    }));

    return { id: parameterId, isMultiSelect };
  },
);

export const SET_PARAMETER_TEMPORAL_UNITS =
  "metabase/dashboard/SET_PARAMETER_TEMPORAL_UNITS";
export const setParameterTemporalUnits = createThunkAction(
  SET_PARAMETER_TEMPORAL_UNITS,
  (parameterId: ParameterId, temporalUnits: TemporalUnit[]) =>
    (dispatch, getState) => {
      updateParameter(dispatch, getState, parameterId, parameter => ({
        ...parameter,
        temporal_units: temporalUnits,
        default:
          parameter.default && temporalUnits.includes(parameter.default)
            ? parameter.default
            : undefined,
      }));

      return { id: parameterId, temporalUnits };
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
      dispatch(dismissUndo({ undoId: toastId, track: false }));
    }
  },
);
