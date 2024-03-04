import { createSelector } from "@reduxjs/toolkit";
import { createCachedSelector } from "re-reselect";
import { createSelectorCreator, lruMemoize } from "reselect";
import _ from "underscore";

import {
  DASHBOARD_SLOW_TIMEOUT,
  SIDEBAR_NAME,
} from "metabase/dashboard/constants";
import { LOAD_COMPLETE_FAVICON } from "metabase/hoc/Favicon";
import { getDashboardUiParameters } from "metabase/parameters/utils/dashboards";
import { getParameterMappingOptions as _getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import type { EmbeddingParameterVisibility } from "metabase/public/lib/types";
import { getEmbedOptions, getIsEmbedded } from "metabase/selectors/embed";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/Question";
import type {
  Card,
  CardId,
  DashboardId,
  DashCardId,
  DashboardCard,
} from "metabase-types/api";
import type {
  ClickBehaviorSidebarState,
  EditParameterSidebarState,
  State,
} from "metabase-types/store";

import { isQuestionDashCard } from "./utils";

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

const createDeepEqualSelector = createSelectorCreator(lruMemoize, _.isEqual);

export const getDashboardBeforeEditing = (state: State) =>
  state.dashboard.editingDashboard;

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
export const getIsSidebarOpen = createSelector(
  [getSidebar],
  sidebar => !!sidebar.name,
);
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

export const getQuestions = (state: State) => {
  const dashboard = getDashboard(state);

  if (!dashboard) {
    return [];
  }

  const dashcardIds = dashboard.dashcards;

  const questionsById = dashcardIds.reduce<Record<CardId, Question>>(
    (acc, dashcardId) => {
      const dashcard = getDashCardById(state, dashcardId);

      if (isQuestionDashCard(dashcard)) {
        const cards = [dashcard.card, ...(dashcard.series ?? [])];

        for (const card of cards) {
          acc[card.id] = getQuestionByCard(state, { card });
        }
      }

      return acc;
    },
    {},
  );

  return questionsById;
};

// getQuestions selector returns an array with stable references to the questions
// but array itself is always new, so it may cause troubles in re-renderings
const getQuestionsMemoized = createDeepEqualSelector(
  [getQuestions],
  questions => {
    return questions;
  },
);

export const getParameters = createSelector(
  [getDashboardComplete, getMetadata, getQuestionsMemoized],
  (dashboard, metadata, questions) => {
    if (!dashboard || !metadata) {
      return [];
    }

    return getDashboardUiParameters(
      dashboard.dashcards,
      dashboard.parameters,
      metadata,
      questions,
    );
  },
);

export const getMissingRequiredParameters = createSelector(
  [getParameters],
  parameters =>
    parameters.filter(
      p =>
        p.required &&
        (!p.default || (Array.isArray(p.default) && p.default.length === 0)),
    ),
);

/**
 * It's a memoized version, it uses LRU cache per card identified by id
 */
export const getQuestionByCard = createCachedSelector(
  [(_state: State, props: { card: Card }) => props.card, getMetadata],
  (card, metadata) => {
    return new Question(card, metadata);
  },
)((_state, props) => {
  return props.card.id;
});

export const getDashcardParameterMappingOptions = createCachedSelector(
  [getQuestionByCard, getEditingParameter, getCard, getDashCard],
  (question, parameter, card, dashcard) => {
    return _getParameterMappingOptions(question, parameter, card, dashcard);
  },
)((state, props) => {
  return props.card.id ?? props.dashcard.id;
});

// Embeddings might be published without passing embedding_params to the server,
// in which case it's an empty object. We should treat such situations with
// caution, assuming that an absent parameter is "disabled".
export function getEmbeddedParameterVisibility(
  state: State,
  slug: string,
): EmbeddingParameterVisibility | null {
  const dashboard = getDashboard(state);
  if (!dashboard?.enable_embedding) {
    return null;
  }

  const embeddingParams = dashboard.embedding_params ?? {};
  return embeddingParams[slug] ?? "disabled";
}

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
