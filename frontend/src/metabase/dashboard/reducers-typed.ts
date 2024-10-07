import { createReducer } from "@reduxjs/toolkit";
import { assocIn } from "icepick";
import produce from "immer";
import { omit } from "underscore";

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
  addManyCardsToDash,
  createPublicLink,
  deletePublicLink,
  fetchDashboard,
  markCardAsSlow,
  setDashboardAttributes,
  setDisplayTheme,
  setDocumentTitle,
  setShowLoadingCompleteFavicon,
  updateEmbeddingParams,
  updateEnableEmbedding,
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
        payload: { toastId: number | null; dashboardId: number | null };
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
          props?: { dashcardId?: DashCardId; parameterId?: ParameterId };
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
      { type: string; payload: { clearCache?: boolean } }
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

    builder.addCase<string, { type: string; payload: { id: ParameterId } }>(
      REMOVE_PARAMETER,
      (state, { payload: { id } }) => {
        delete state[id];
      },
    );
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
      .addCase(updateEmbeddingParams.fulfilled, (state, { payload }) =>
        assocIn(
          state,
          [payload.id, "embedding_params"],
          payload.embedding_params,
        ),
      )
      .addCase(updateEnableEmbedding.fulfilled, (state, { payload }) => {
        const dashboard = state[payload.id];
        dashboard.enable_embedding = payload.enable_embedding;
        dashboard.initially_published_at = payload.initially_published_at;
      })
      .addCase(Dashboards.actionTypes.UPDATE, (state, { payload }) =>
        produce(state, draftState => {
          const draftDashboard = draftState[payload.dashboard.id];
          if (draftDashboard) {
            draftDashboard.collection_id = payload.dashboard.collection_id;
            draftDashboard.collection = payload.dashboard.collection;
          }
        }),
      )
      .addCase(createPublicLink.fulfilled, (state, { payload }) =>
        assocIn(state, [payload.id, "public_uuid"], payload.uuid),
      )
      .addCase(deletePublicLink.fulfilled, (state, { payload }) =>
        assocIn(state, [payload.id, "public_uuid"], null),
      );
  },
);
