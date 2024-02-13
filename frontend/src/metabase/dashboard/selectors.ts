import _ from "underscore";
import { createSelector } from "@reduxjs/toolkit";

import { getEmbedOptions, getIsEmbedded } from "metabase/selectors/embed";
import { getMetadata } from "metabase/selectors/metadata";
import { LOAD_COMPLETE_FAVICON } from "metabase/hoc/Favicon";

import {
  DASHBOARD_SLOW_TIMEOUT,
  SIDEBAR_NAME,
} from "metabase/dashboard/constants";

import { getDashboardUiParameters } from "metabase/parameters/utils/dashboards";
import { getParameterMappingOptions as _getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";

import type {
  Bookmark,
  Card,
  DashboardCard,
  DashboardId,
  DashCardId,
} from "metabase-types/api";
import type {
  ClickBehaviorSidebarState,
  EditParameterSidebarState,
  State,
} from "metabase-types/store";

type SidebarState = State["dashboard"]["sidebar"];

function isClickBehaviorSidebar(
  sidebar: SidebarState,
): sidebar is ClickBehaviorSidebarState {
  return sidebar.name === SIDEBAR_NAME.clickBehavior;
}

function isEditParameterSidebar(
  sidebar: SidebarState,
): sidebar is EditParameterSidebarState {
  return sidebar.name === SIDEBAR_NAME.editParameter;
}

export const getDashboardBeforeEditing = (state: State) =>
  state.dashboard.isEditing;

export const getIsEditing = (state: State) =>
  Boolean(getDashboardBeforeEditing(state));

export const getClickBehaviorSidebarDashcard = (state: State) => {
  const { sidebar, dashcards } = state.dashboard;
  return isClickBehaviorSidebar(sidebar)
    ? dashcards[sidebar.props?.dashcardId]
    : null;
};
export const getDashboards = (state: State) => state.dashboard.dashboards;
export const getCardData = (state: State) => state.dashboard.dashcardData;
export const getSlowCards = (state: State) => state.dashboard.slowCards;
export const getParameterValues = (state: State) =>
  state.dashboard.parameterValues;
export const getFavicon = (state: State) =>
  state.dashboard.loadingControls?.showLoadCompleteFavicon
    ? LOAD_COMPLETE_FAVICON
    : null;

export const getIsRunning = (state: State) =>
  state.dashboard.loadingDashCards.loadingStatus === "running";
export const getIsLoadingComplete = (state: State) =>
  state.dashboard.loadingDashCards.loadingStatus === "complete";

export const getLoadingStartTime = (state: State) =>
  state.dashboard.loadingDashCards.startTime;
export const getLoadingEndTime = (state: State) =>
  state.dashboard.loadingDashCards.endTime;

export const getIsSlowDashboard = createSelector(
  [getLoadingStartTime, getLoadingEndTime],
  (startTime, endTime) => {
    if (startTime != null && endTime != null) {
      return endTime - startTime > DASHBOARD_SLOW_TIMEOUT;
    } else {
      return false;
    }
  },
);

export const getIsAddParameterPopoverOpen = (state: State) =>
  state.dashboard.isAddParameterPopoverOpen;

export const getSidebar = (state: State) => state.dashboard.sidebar;
export const getIsSharing = createSelector(
  [getSidebar],
  sidebar => sidebar.name === SIDEBAR_NAME.sharing,
);

export const getShowAddQuestionSidebar = createSelector(
  [getSidebar],
  sidebar => sidebar.name === SIDEBAR_NAME.addQuestion,
);

export const getIsShowDashboardInfoSidebar = createSelector(
  [getSidebar],
  sidebar => sidebar.name === SIDEBAR_NAME.info,
);

export const getDashboardId = (state: State) => state.dashboard.dashboardId;

export const getDashboard = createSelector(
  [getDashboardId, getDashboards],
  (dashboardId, dashboards) =>
    dashboardId !== null ? dashboards[dashboardId] : undefined,
);

export const getDashcards = (state: State) => state.dashboard.dashcards;

export const getDashCardById = (state: State, dashcardId: DashCardId) => {
  const dashcards = getDashcards(state);
  return dashcards[dashcardId];
};

export function getDashCardBeforeEditing(state: State, dashcardId: DashCardId) {
  const dashboard = getDashboardBeforeEditing(state);
  return dashboard?.dashcards?.find?.(dashcard => dashcard.id === dashcardId);
}

export const getLoadingDashCards = (state: State) =>
  state.dashboard.loadingDashCards;

export const getDashboardById = (state: State, dashboardId: DashboardId) => {
  const dashboards = getDashboards(state);
  return dashboards[dashboardId];
};

export const getSingleDashCardData = (state: State, dashcardId: DashCardId) => {
  const dashcard = getDashCardById(state, dashcardId);
  const cardDataMap = getCardData(state);
  if (!dashcard?.card_id || !cardDataMap) {
    return;
  }
  return cardDataMap?.[dashcard.id]?.[dashcard.card_id]?.data;
};

export const getDashboardComplete = createSelector(
  [getDashboard, getDashcards],
  (dashboard, dashcards) => {
    if (!dashboard) {
      return null;
    }

    const orderedDashcards = dashboard.dashcards
      .map(id => dashcards[id])
      .filter(dc => !dc.isRemoved)
      .sort((a, b) => {
        const rowDiff = a.row - b.row;

        // sort by y position first
        if (rowDiff !== 0) {
          return rowDiff;
        }

        // for items on the same row, sort by x position
        return a.col - b.col;
      });

    return (
      dashboard && {
        ...dashboard,
        dashcards: orderedDashcards,
      }
    );
  },
);

export const getAutoApplyFiltersToastId = (state: State) =>
  state.dashboard.autoApplyFilters.toastId;
export const getAutoApplyFiltersToastDashboardId = (state: State) =>
  state.dashboard.autoApplyFilters.toastDashboardId;
export const getDraftParameterValues = (state: State) =>
  state.dashboard.draftParameterValues;

export const getIsAutoApplyFilters = createSelector(
  [getDashboard],
  dashboard => !!dashboard?.auto_apply_filters,
);
export const getHasUnappliedParameterValues = createSelector(
  [getParameterValues, getDraftParameterValues],
  (parameterValues, draftParameterValues) => {
    return !_.isEqual(draftParameterValues, parameterValues);
  },
);

const getIsParameterValuesEmpty = createSelector(
  [getParameterValues],
  parameterValues => {
    return Object.values(parameterValues).every(parameterValue =>
      Array.isArray(parameterValue)
        ? parameterValue.length === 0
        : parameterValue == null,
    );
  },
);

export const getCanShowAutoApplyFiltersToast = createSelector(
  [
    getDashboard,
    getAutoApplyFiltersToastDashboardId,
    getIsAutoApplyFilters,
    getIsSlowDashboard,
    getIsParameterValuesEmpty,
  ],
  (
    dashboard,
    toastDashboardId,
    isAutoApply,
    isSlowDashboard,
    isParameterValuesEmpty,
  ) => {
    return (
      dashboard?.can_write &&
      dashboard?.id !== toastDashboardId &&
      isAutoApply &&
      isSlowDashboard &&
      !isParameterValuesEmpty
    );
  },
);

export const getDocumentTitle = (state: State) =>
  state.dashboard.loadingControls.documentTitle;

export const getIsNavigatingBackToDashboard = (state: State) =>
  state.dashboard.isNavigatingBackToDashboard;

type IsBookmarkedSelectorProps = {
  bookmarks: Bookmark[];
  dashboardId: DashboardId;
};

export const getIsBookmarked = (
  state: State,
  { bookmarks, dashboardId }: IsBookmarkedSelectorProps,
) =>
  bookmarks.some(
    bookmark =>
      bookmark.type === "dashboard" && bookmark.item_id === dashboardId,
  );

export const getIsDirty = createSelector(
  [getDashboard, getDashcards],
  (dashboard, dashcards) => {
    if (!dashboard) {
      return false;
    }

    if (dashboard.isDirty) {
      return true;
    }

    return dashboard.dashcards.some(id => {
      const dc = dashcards[id];
      return (
        !(dc.isAdded && dc.isRemoved) &&
        (dc.isDirty || dc.isAdded || dc.isRemoved)
      );
    });
  },
);

export const getEditingDashcardId = createSelector([getSidebar], sidebar => {
  return sidebar?.props?.dashcardId;
});

export const getEditingParameterId = createSelector([getSidebar], sidebar => {
  return isEditParameterSidebar(sidebar) ? sidebar.props?.parameterId : null;
});

export const getIsEditingParameter = createSelector(
  [getEditingParameterId],
  parameterId => parameterId != null,
);

export const getEditingParameter = createSelector(
  [getDashboard, getEditingParameterId],
  (dashboard, editingParameterId) => {
    const parameters = dashboard?.parameters || [];
    return editingParameterId != null
      ? _.findWhere(parameters, { id: editingParameterId })
      : null;
  },
);

const getCard = (state: State, { card }: { card: Card }) => card;
const getDashCard = (state: State, { dashcard }: { dashcard: DashboardCard }) =>
  dashcard;

export const getParameterTarget = createSelector(
  [getEditingParameter, getCard, getDashCard],
  (parameter, card, dashcard) => {
    if (parameter == null) {
      return null;
    }

    const parameterMappings = dashcard.parameter_mappings || [];

    const lookupProperties = card?.id
      ? { parameter_id: parameter.id, card_id: card.id }
      : { parameter_id: parameter.id };

    const mapping = _.findWhere(parameterMappings, lookupProperties);
    return mapping?.target;
  },
);

export const getParameters = createSelector(
  [getDashboardComplete, getMetadata],
  (dashboard, metadata) => {
    if (!dashboard || !metadata) {
      return [];
    }
    return getDashboardUiParameters(dashboard, metadata);
  },
);

export const getParameterMappingOptions = createSelector(
  [getMetadata, getEditingParameter, getCard, getDashCard],
  (metadata, parameter, card, dashcard) => {
    return _getParameterMappingOptions(metadata, parameter, card, dashcard);
  },
);

export const getIsHeaderVisible = createSelector(
  [getIsEmbedded, getEmbedOptions],
  (isEmbedded, embedOptions) => !isEmbedded || !!embedOptions.header,
);

export const getIsAdditionalInfoVisible = createSelector(
  [getIsEmbedded, getEmbedOptions],
  (isEmbedded, embedOptions) => !isEmbedded || !!embedOptions.additional_info,
);

export const getTabs = createSelector([getDashboard], dashboard => {
  if (!dashboard) {
    return [];
  }
  return dashboard.tabs?.filter(tab => !tab.isRemoved) ?? [];
});

export function getSelectedTabId(state: State) {
  return state.dashboard.selectedTabId;
}
