import { createReducer } from "@reduxjs/toolkit";
import { assoc, assocIn, dissoc } from "icepick";
import { omit } from "underscore";

import {
  createDashboardPublicLink,
  deleteDashboardPublicLink,
  updateDashboardEmbeddingParams,
  updateDashboardEnableEmbedding,
} from "metabase/api";
import Dashboards from "metabase/entities/dashboards";
import { handleActions } from "metabase/lib/redux";
import { NAVIGATE_BACK_TO_DASHBOARD } from "metabase/query_builder/actions";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  DashCardId,
  Dashboard,
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/api";
import type {
  DashboardSidebarName,
  StoreDashboard,
} from "metabase-types/store/dashboard";

import {
  CLOSE_SIDEBAR,
  HIDE_ADD_PARAMETER_POPOVER,
  INITIALIZE,
  REMOVE_PARAMETER,
  RESET,
  RESET_PARAMETERS,
  SET_EDITING_DASHBOARD,
  SET_PARAMETER_VALUE,
  SET_PARAMETER_VALUES,
  SET_SIDEBAR,
  SHOW_ADD_PARAMETER_POPOVER,
  SHOW_AUTO_APPLY_FILTERS_TOAST,
  addCardToDash,
  addDashcardIdsToLoadingQueue,
  addManyCardsToDash,
  cancelFetchCardData,
  fetchCardDataAction,
  fetchDashboard,
  fetchDashboardCardDataAction,
  initialize,
  markCardAsSlow,
  reset,
  setDashboardAttributes,
  setDisplayTheme,
  setDocumentTitle,
  setShowLoadingCompleteFavicon,
} from "./actions";
import { INITIAL_DASHBOARD_STATE } from "./constants";
import { syncParametersAndEmbeddingParams } from "./utils";

export const dashboardId = createReducer(
  INITIAL_DASHBOARD_STATE.dashboardId,
  builder => {
    builder.addCase(INITIALIZE, () => null);
    builder.addCase(
      fetchDashboard.fulfilled,
      (_state, { payload }) => payload.dashboardId,
    );
    builder.addCase(RESET, () => null);
  },
);

// TODO: double check if this reducer is used
export const missingActionParameters = handleActions(
  {
    [INITIALIZE]: {
      next: () => null,
    },
    [RESET]: {
      next: () => null,
    },
  },
  INITIAL_DASHBOARD_STATE.missingActionParameters,
);

export const autoApplyFilters = createReducer(
  INITIAL_DASHBOARD_STATE.autoApplyFilters,
  builder => {
    builder.addCase<
      string,
      {
        type: string;
        payload: {
          toastId: number | null;
          dashboardId: number | null;
        };
      }
    >(SHOW_AUTO_APPLY_FILTERS_TOAST, (state, { payload }) => {
      const { toastId, dashboardId } = payload;

      state.toastId = toastId;
      state.toastDashboardId = dashboardId;
    });
  },
);

export const theme = createReducer(INITIAL_DASHBOARD_STATE.theme, builder => {
  builder.addCase(setDisplayTheme, (_state, { payload }) => payload || null);
});

export const slowCards = createReducer(
  INITIAL_DASHBOARD_STATE.slowCards,
  builder => {
    builder.addCase(markCardAsSlow, (state, { payload: { id, result } }) => ({
      ...state,
      [id]: result,
    }));
  },
);

export const isNavigatingBackToDashboard = handleActions(
  {
    [NAVIGATE_BACK_TO_DASHBOARD]: () => true,
    [RESET]: () => false,
  },
  INITIAL_DASHBOARD_STATE.isNavigatingBackToDashboard,
);

export const isAddParameterPopoverOpen = handleActions(
  {
    [SHOW_ADD_PARAMETER_POPOVER]: () => true,
    [HIDE_ADD_PARAMETER_POPOVER]: () => false,
    [INITIALIZE]: () => false,
    [RESET]: () => false,
  },
  INITIAL_DASHBOARD_STATE.isAddParameterPopoverOpen,
);

export const editingDashboard = handleActions(
  {
    [INITIALIZE]: { next: () => INITIAL_DASHBOARD_STATE.editingDashboard },
    [SET_EDITING_DASHBOARD]: {
      next: (_state, { payload }) => payload ?? null,
    },
    [RESET]: { next: () => INITIAL_DASHBOARD_STATE.editingDashboard },
  },
  INITIAL_DASHBOARD_STATE.editingDashboard,
);

export const loadingControls = createReducer(
  INITIAL_DASHBOARD_STATE.loadingControls,
  builder => {
    builder.addCase(setDocumentTitle, (state, { payload }) => {
      state.documentTitle = payload;
    });

    builder.addCase(setShowLoadingCompleteFavicon, (state, { payload }) => {
      state.showLoadCompleteFavicon = payload;
    });

    builder.addCase(RESET, () => INITIAL_DASHBOARD_STATE.loadingControls);

    builder.addCase(INITIALIZE, () => INITIAL_DASHBOARD_STATE.loadingControls);

    builder.addCase(fetchDashboard.pending, state => {
      state.isLoading = true;
    });

    builder.addCase(fetchDashboard.fulfilled, state => {
      state.isLoading = false;
    });

    builder.addCase(fetchDashboard.rejected, state => {
      state.isLoading = false;
    });
  },
);

const DEFAULT_SIDEBAR = { props: {} };
export const sidebar = createReducer(
  INITIAL_DASHBOARD_STATE.sidebar,
  builder => {
    builder.addCase(INITIALIZE, () => DEFAULT_SIDEBAR);
    builder.addCase(RESET, () => DEFAULT_SIDEBAR);
    builder.addCase(REMOVE_PARAMETER, () => DEFAULT_SIDEBAR);
    builder.addCase(SET_EDITING_DASHBOARD, () => DEFAULT_SIDEBAR);
    builder.addCase(CLOSE_SIDEBAR, () => DEFAULT_SIDEBAR);

    builder.addCase<
      string,
      {
        type: string;
        payload: {
          name: DashboardSidebarName;
          props?: {
            dashcardId?: DashCardId;
            parameterId?: ParameterId;
          };
        };
      }
    >(SET_SIDEBAR, (_state, { payload: { name, props } }) => ({
      name,
      props: props || {},
    }));
  },
);

export const parameterValues = createReducer(
  INITIAL_DASHBOARD_STATE.parameterValues,
  builder => {
    builder.addCase<
      string,
      {
        type: string;
        payload: {
          clearCache?: boolean;
        };
      }
    >(INITIALIZE, (state, { payload: { clearCache = true } = {} }) => {
      return clearCache ? {} : state;
    });

    builder.addCase(fetchDashboard.fulfilled, (_state, { payload }) => {
      return payload.parameterValues;
    });

    builder.addCase<
      string,
      {
        type: string;
        payload: {
          id: ParameterId;
          value: ParameterValueOrArray;
          isDraft: boolean;
        };
      }
    >(SET_PARAMETER_VALUE, (state, { payload: { id, value, isDraft } }) => {
      if (!isDraft) {
        state[id] = value;
      }
    });

    builder.addCase<
      string,
      {
        type: string;
        payload: Record<ParameterId, ParameterValueOrArray>;
      }
    >(SET_PARAMETER_VALUES, (_state, { payload }) => {
      return payload;
    });

    builder.addCase<
      string,
      {
        type: string;
        payload: UiParameter[];
      }
    >(RESET_PARAMETERS, (state, { payload: parameters }) => {
      for (const parameter of parameters) {
        const { id, value } = parameter;
        state[id] = value;
      }
    });

    builder.addCase<
      string,
      {
        type: string;
        payload: {
          id: ParameterId;
        };
      }
    >(REMOVE_PARAMETER, (state, { payload: { id } }) => {
      delete state[id];
    });
  },
);

function newDashboard(
  before: StoreDashboard,
  after: Partial<Dashboard>,
  isDirty: boolean,
): StoreDashboard {
  return {
    ...before,
    // mimic the StoreDashboard type - this function is only made to update attributes
    // rather than deep values like dashcards or tabs
    ...omit(after, "dashcards", "tabs"),
    embedding_params: syncParametersAndEmbeddingParams(before, after),
    isDirty,
  };
}

export const dashboards = createReducer(
  INITIAL_DASHBOARD_STATE.dashboards,
  builder => {
    builder
      .addCase(fetchDashboard.fulfilled, (state, { payload }) => ({
        ...state,
        ...payload.entities.dashboard,
      }))
      .addCase(
        setDashboardAttributes,
        (state, { payload: { id, attributes, isDirty = true } }) => ({
          ...state,
          [id]: newDashboard(state[id], attributes, isDirty),
        }),
      )
      .addCase(addCardToDash, (state, { payload: dashcard }) => ({
        ...state,
        [dashcard.dashboard_id]: {
          ...state[dashcard.dashboard_id],
          dashcards: [...state[dashcard.dashboard_id].dashcards, dashcard.id],
        },
      }))
      .addCase(addManyCardsToDash, (state, { payload: dashcards }) => {
        const [{ dashboard_id }] = dashcards;
        const dashcardIds = dashcards.map(({ id }) => id);
        return {
          ...state,
          [dashboard_id]: {
            ...state[dashboard_id],
            dashcards: [...state[dashboard_id].dashcards, ...dashcardIds],
          },
        };
      })
      .addCase(Dashboards.actionTypes.UPDATE, (state, { payload }) => {
        const draftDashboard = state[payload.dashboard.id];
        if (draftDashboard) {
          draftDashboard.collection_id = payload.dashboard.collection_id;
          draftDashboard.collection = payload.dashboard.collection;
        }
      })
      .addMatcher(
        createDashboardPublicLink.matchFulfilled,
        (state, { payload }) =>
          assocIn(state, [payload.id, "public_uuid"], payload.uuid),
      )
      .addMatcher(
        deleteDashboardPublicLink.matchFulfilled,
        (state, { payload }) =>
          assocIn(state, [payload.id, "public_uuid"], null),
      )
      .addMatcher(
        updateDashboardEmbeddingParams.matchFulfilled,
        (state, { payload }) =>
          assocIn(
            state,
            [payload.id, "embedding_params"],
            payload.embedding_params,
          ),
      )
      .addMatcher(
        updateDashboardEnableEmbedding.matchFulfilled,
        (state, { payload }) => {
          const dashboard = state[payload.id];
          dashboard.enable_embedding = payload.enable_embedding;
          dashboard.initially_published_at = payload.initially_published_at;
        },
      );
  },
);

export const loadingDashCards = createReducer(
  INITIAL_DASHBOARD_STATE.loadingDashCards,
  builder => {
    builder
      .addCase(initialize, state => ({
        ...state,
        loadingStatus: "idle",
      }))
      .addCase(fetchDashboardCardDataAction, (state, action) => {
        const { currentTime, loadingIds } = action.payload;
        return {
          ...state,
          loadingIds,
          loadingStatus: loadingIds.length > 0 ? "running" : "idle",
          startTime: loadingIds.length > 0 ? currentTime : null,
        };
      })
      .addCase(addDashcardIdsToLoadingQueue, (state, action) => {
        const { dashcard_id } = action.payload;
        const loadingIds = !state.loadingIds.includes(dashcard_id)
          ? state.loadingIds.concat(dashcard_id)
          : state.loadingIds;
        return {
          ...state,
          loadingIds,
        };
      })
      .addCase(fetchCardDataAction.fulfilled, (state, { payload = {} }) => {
        const { dashcard_id, currentTime } = payload;
        if (dashcard_id) {
          const loadingIds = state.loadingIds.filter(id => id !== dashcard_id);
          return {
            ...state,
            loadingIds,
            ...(loadingIds.length === 0
              ? { endTime: currentTime, loadingStatus: "complete" }
              : {}),
          };
        }
      })
      .addCase(cancelFetchCardData, (state, action) => {
        const { dashcard_id } = action.payload;
        const loadingIds = state.loadingIds.filter(id => id !== dashcard_id);
        return {
          ...state,
          loadingIds,
          ...(loadingIds.length === 0 ? { startTime: null } : {}),
        };
      })
      .addCase(reset, state => ({
        ...state,
        loadingStatus: "idle",
      }));
  },
);

export const draftParameterValues = createReducer({}, builder => {
  builder
    .addCase<string, { type: string; payload?: { clearCache?: boolean } }>(
      INITIALIZE,
      (state, action) => {
        const { clearCache = true } = action.payload ?? {};
        return clearCache ? {} : state;
      },
    )

    .addCase(fetchDashboard.fulfilled, (state, action) => {
      const { dashboard, parameterValues, preserveParameters } = action.payload;
      return preserveParameters && !dashboard.auto_apply_filters
        ? state
        : parameterValues;
    })

    .addCase<
      string,
      {
        type: string;
        payload: {
          id: ParameterId;
          value: ParameterValueOrArray;
          isDraft: boolean;
        };
      }
    >(SET_PARAMETER_VALUE, (state, action) => {
      const { id, value } = action.payload;
      return assoc(state ?? {}, id, value);
    })

    .addCase<
      string,
      {
        type: string;
        payload: Record<ParameterId, ParameterValueOrArray>;
      }
    >(SET_PARAMETER_VALUES, (_state, action) => action.payload)

    .addCase<
      string,
      {
        type: string;
        payload: UiParameter[];
      }
    >(RESET_PARAMETERS, (state, action) => {
      const parameters = action.payload;
      return parameters.reduce(
        (result, parameter) => assoc(result, parameter.id, parameter.value),
        state ?? {},
      );
    })

    .addCase<string, { type: string; payload: { id: ParameterId } }>(
      REMOVE_PARAMETER,
      (state, action) => {
        const { id } = action.payload;
        return dissoc(state, id);
      },
    );
});

// Combined reducer needs to init state for every slice
export const selectedTabId = (state = INITIAL_DASHBOARD_STATE.selectedTabId) =>
  state;
export const tabDeletions = (state = INITIAL_DASHBOARD_STATE.tabDeletions) =>
  state;
