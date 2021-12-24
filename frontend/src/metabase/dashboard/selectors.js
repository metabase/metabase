import _ from "underscore";

import { createSelector } from "reselect";

import { getMetadata } from "metabase/selectors/metadata";

import {
  getMappingsByParameter as _getMappingsByParameter,
  getDashboardParametersWithFieldMetadata,
} from "metabase/parameters/utils/dashboards";
import { getParameterMappingOptions as _getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";

import { SIDEBAR_NAME } from "metabase/dashboard/constants";

export const getDashboardId = state => state.dashboard.dashboardId;
export const getIsEditing = state => !!state.dashboard.isEditing;
export const getDashboardBeforeEditing = state => state.dashboard.isEditing;
export const getClickBehaviorSidebarDashcard = state => {
  const { sidebar, dashcards } = state.dashboard;
  return sidebar.name === SIDEBAR_NAME.clickBehavior
    ? dashcards[sidebar.props.dashcardId]
    : null;
};
export const getDashboards = state => state.dashboard.dashboards;
export const getDashcards = state => state.dashboard.dashcards;
export const getCardData = state => state.dashboard.dashcardData;
export const getSlowCards = state => state.dashboard.slowCards;
export const getParameterValues = state => state.dashboard.parameterValues;
export const getLoadingStartTime = state =>
  state.dashboard.loadingDashCards.startTime;
export const getIsAddParameterPopoverOpen = state =>
  state.dashboard.isAddParameterPopoverOpen;

export const getSidebar = state => state.dashboard.sidebar;
export const getIsSharing = createSelector(
  [getSidebar],
  sidebar => sidebar.name === SIDEBAR_NAME.sharing,
);

export const getShowAddQuestionSidebar = createSelector(
  [getSidebar],
  sidebar => sidebar.name === SIDEBAR_NAME.addQuestion,
);

export const getDashboard = createSelector(
  [getDashboardId, getDashboards],
  (dashboardId, dashboards) => dashboards[dashboardId],
);

export const getDashboardComplete = createSelector(
  [getDashboard, getDashcards],
  (dashboard, dashcards) =>
    dashboard && {
      ...dashboard,
      ordered_cards: dashboard.ordered_cards
        .map(id => dashcards[id])
        .filter(dc => !dc.isRemoved),
    },
);

export const getIsDirty = createSelector(
  [getDashboard, getDashcards],
  (dashboard, dashcards) =>
    !!(
      dashboard &&
      (dashboard.isDirty ||
        _.some(
          dashboard.ordered_cards,
          id =>
            !(dashcards[id].isAdded && dashcards[id].isRemoved) &&
            (dashcards[id].isDirty ||
              dashcards[id].isAdded ||
              dashcards[id].isRemoved),
        ))
    ),
);

export const getEditingParameterId = createSelector([getSidebar], sidebar => {
  return sidebar.name === SIDEBAR_NAME.editParameter
    ? sidebar.props?.parameterId
    : null;
});

export const getIsEditingParameter = createSelector(
  [getEditingParameterId],
  parameterId => parameterId != null,
);

export const getEditingParameter = createSelector(
  [getDashboard, getEditingParameterId],
  (dashboard, editingParameterId) =>
    editingParameterId != null
      ? _.findWhere(dashboard.parameters, { id: editingParameterId })
      : null,
);

const getCard = (state, props) => props.card;
const getDashCard = (state, props) => props.dashcard;

export const getParameterTarget = createSelector(
  [getEditingParameter, getCard, getDashCard],
  (parameter, card, dashcard) => {
    if (parameter == null) {
      return null;
    }
    const mapping = _.findWhere(dashcard.parameter_mappings, {
      card_id: card.id,
      parameter_id: parameter.id,
    });
    return mapping && mapping.target;
  },
);

export const getMappingsByParameter = createSelector(
  [getMetadata, getDashboardComplete],
  _getMappingsByParameter,
);

/** Returns the dashboard's parameters objects, with field_id added, if appropriate */
export const getParameters = createSelector(
  [getMetadata, getDashboard, getMappingsByParameter],
  getDashboardParametersWithFieldMetadata,
);

export const makeGetParameterMappingOptions = () => {
  const getParameterMappingOptions = createSelector(
    [getMetadata, getEditingParameter, getCard],
    (metadata, parameter, card) => {
      return _getParameterMappingOptions(metadata, parameter, card);
    },
  );
  return getParameterMappingOptions;
};

export const getDefaultParametersById = createSelector(
  [getDashboard],
  dashboard =>
    ((dashboard && dashboard.parameters) || []).reduce((map, parameter) => {
      if (parameter.default) {
        map[parameter.id] = parameter.default;
      }

      return map;
    }, {}),
);

export const getDashboardParameterValuesSearch = state =>
  state.dashboard.parameterValuesSearchCache;

export const getDashboardParameterValuesCache = state => {
  return {
    get: ({ dashboardId, parameter, parameters, query }) => {
      const { parameterValuesSearchCache } = state.dashboard;
      const { id: paramId, filteringParameters = [] } = parameter;
      const otherValues = _.chain(parameters)
        .filter(p => filteringParameters.includes(p.id) && p.value != null)
        .map(p => [p.id, p.value])
        .object()
        .value();

      const args = {
        paramId,
        dashId: dashboardId,
        ...otherValues,
        ...(query != null ? { query } : {}),
      };

      const key = JSON.stringify(args);
      return parameterValuesSearchCache[key];
    },
  };
};
