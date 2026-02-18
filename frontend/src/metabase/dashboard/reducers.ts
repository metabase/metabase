import type { UnknownAction } from "@reduxjs/toolkit";
import { assoc, assocIn, chain, dissoc, merge, updateIn } from "icepick";
import _ from "underscore";

import { Actions } from "metabase/entities/actions";
import { Questions } from "metabase/entities/questions";
import { combineReducers, handleActions } from "metabase/lib/redux";
import type { Card, WritebackAction } from "metabase-types/api";

import {
  ADD_CARD_TO_DASH,
  ADD_MANY_CARDS_TO_DASH,
  INITIALIZE,
  MARK_NEW_CARD_SEEN,
  REMOVE_CARD_FROM_DASH,
  REMOVE_PARAMETER,
  REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS,
  RESET_PARAMETERS,
  SET_DASHCARD_ATTRIBUTES,
  SET_MULTIPLE_DASHCARD_ATTRIBUTES,
  SET_PARAMETER_VALUE,
  SET_PARAMETER_VALUES,
  UNDO_REMOVE_CARD_FROM_DASH,
  UPDATE_DASHCARD_VISUALIZATION_SETTINGS,
  UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN,
  type addCardToDash,
  type addManyCardsToDash,
  fetchDashboard,
  type initialize,
  type markNewCardSeen,
  type onReplaceAllDashCardVisualizationSettings,
  type onUpdateDashCardColumnSettings,
  type onUpdateDashCardVisualizationSettings,
  type removeCardFromDashboard,
  type removeParameter,
  type resetParameters,
  type setDashCardAttributes,
  type setMultipleDashCardAttributes,
  type setParameterValue,
  tabsReducer,
  type undoRemoveCardFromDashboard,
} from "./actions";
import { INITIAL_DASHBOARD_STATE } from "./constants";
import {
  autoApplyFilters,
  dashboardId,
  dashboards,
  dashcardData,
  editingDashboard,
  isAddParameterPopoverOpen,
  isNavigatingBackToDashboard,
  loadingControls,
  loadingDashCards,
  missingActionParameters,
  parameterValues,
  sidebar,
  slowCards,
} from "./reducers-typed";
import { calculateDashCardRowAfterUndo } from "./utils";

type PayloadFromActionCreator<
  T extends (...args: any[]) => { payload: unknown },
> = ReturnType<T>["payload"];

type PayloadFromThunkActionCreator<T extends (...args: any[]) => any> =
  ReturnType<T> extends (...args: any[]) => Promise<infer TResult>
    ? TResult extends { payload: infer TPayload }
      ? TPayload
      : never
    : never;

type DashcardsState = typeof INITIAL_DASHBOARD_STATE.dashcards;
type DraftParameterValuesState =
  typeof INITIAL_DASHBOARD_STATE.draftParameterValues;

const dashcards = handleActions<DashcardsState, unknown>(
  {
    [fetchDashboard.fulfilled.type]: {
      next: (
        state: DashcardsState,
        action: ReturnType<typeof fetchDashboard.fulfilled>,
      ) => ({
        ...state,
        ...action.payload.entities.dashcard,
      }),
    },
    [SET_DASHCARD_ATTRIBUTES]: {
      next: (
        state: DashcardsState,
        {
          payload: { id, attributes },
        }: {
          type: string;
          payload: PayloadFromActionCreator<typeof setDashCardAttributes>;
        },
      ) => ({
        ...assocIn(state, [id], {
          ...state[id],
          ...attributes,
          isDirty: true,
        }),
      }),
    },
    [SET_MULTIPLE_DASHCARD_ATTRIBUTES]: {
      next: (
        state: DashcardsState,
        {
          payload: { dashcards },
        }: {
          type: string;
          payload: PayloadFromActionCreator<
            typeof setMultipleDashCardAttributes
          >;
        },
      ) => {
        const updates = Object.fromEntries(
          dashcards.map(({ id, attributes }) => [
            id,
            { ...state[id], ...attributes, isDirty: true },
          ]),
        );
        return { ...state, ...updates };
      },
    },
    [UPDATE_DASHCARD_VISUALIZATION_SETTINGS]: {
      next: (
        state: DashcardsState,
        {
          payload: { id, settings },
        }: {
          type: string;
          payload: PayloadFromActionCreator<
            typeof onUpdateDashCardVisualizationSettings
          >;
        },
      ) =>
        chain(state)
          .updateIn([id, "visualization_settings"], (value = {}) => ({
            ...value,
            ...settings,
          }))
          .assocIn([id, "isDirty"], true)
          .value(),
    },
    [UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN]: {
      next: (
        state: DashcardsState,
        {
          payload: { column, id, settings },
        }: {
          type: string;
          payload: PayloadFromActionCreator<
            typeof onUpdateDashCardColumnSettings
          >;
        },
      ) =>
        chain(state)
          .updateIn([id, "visualization_settings"], (value = {}) =>
            updateIn(
              merge({ column_settings: {} }, value),
              ["column_settings", column],
              (columnSettings) => ({
                ...columnSettings,
                ...settings,
              }),
            ),
          )
          .assocIn([id, "isDirty"], true)
          .value(),
    },
    [REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS]: {
      next: (
        state: DashcardsState,
        {
          payload: { id, settings },
        }: {
          type: string;
          payload: PayloadFromActionCreator<
            typeof onReplaceAllDashCardVisualizationSettings
          >;
        },
      ) =>
        chain(state)
          .assocIn([id, "visualization_settings"], settings)
          .assocIn([id, "isDirty"], true)
          .value(),
    },
    [ADD_CARD_TO_DASH]: {
      next: (
        state: DashcardsState,
        {
          payload: dashcard,
        }: {
          type: string;
          payload: PayloadFromActionCreator<typeof addCardToDash>;
        },
      ) =>
        assocIn(state, [dashcard.id], {
          ...dashcard,
          isAdded: true,
          justAdded: true,
        }),
    },
    [ADD_MANY_CARDS_TO_DASH]: {
      next: (
        state: DashcardsState,
        {
          payload: dashcards,
        }: {
          type: string;
          payload: PayloadFromActionCreator<typeof addManyCardsToDash>;
        },
      ) => {
        let nextState = state;
        dashcards.forEach((dc, index) => {
          nextState = assocIn(nextState, [dc.id], {
            ...dc,
            isAdded: true,
            justAdded: index === 0,
          });
        });
        return nextState;
      },
    },
    [REMOVE_CARD_FROM_DASH]: {
      next: (
        state: DashcardsState,
        {
          payload: { dashcardId },
        }: {
          type: string;
          payload: PayloadFromThunkActionCreator<
            typeof removeCardFromDashboard
          >;
        },
      ) =>
        assocIn(state, [dashcardId], {
          ...state[dashcardId],
          isRemoved: true,
        }),
    },
    [UNDO_REMOVE_CARD_FROM_DASH]: {
      next: (
        state: DashcardsState,
        {
          payload: { dashcardId },
        }: {
          type: string;
          payload: PayloadFromThunkActionCreator<
            typeof undoRemoveCardFromDashboard
          >;
        },
      ) =>
        assocIn(state, [dashcardId], {
          ...state[dashcardId],
          isRemoved: false,
          row: calculateDashCardRowAfterUndo(state[dashcardId].row),
        }),
    },
    [MARK_NEW_CARD_SEEN]: {
      next: (
        state: DashcardsState,
        {
          payload: dashcardId,
        }: {
          type: string;
          payload: PayloadFromActionCreator<typeof markNewCardSeen>;
        },
      ) =>
        assocIn(state, [dashcardId], {
          ...state[dashcardId],
          justAdded: false,
        }),
    },
    [Questions.actionTypes.UPDATE]: (
      state: DashcardsState,
      {
        payload: { object: card },
      }: {
        type: string;
        payload: { object: Card | null | undefined };
      },
    ) =>
      _.mapObject(state, (dashcard) =>
        dashcard.card?.id === card?.id
          ? assocIn(dashcard, ["card"], card)
          : dashcard,
      ),
    [Actions.actionTypes.UPDATE]: (
      state: DashcardsState,
      {
        payload: { object: action },
      }: {
        type: string;
        payload: { object: WritebackAction | null | undefined };
      },
    ) =>
      _.mapObject(state, (dashcard) => {
        if (!("action" in dashcard) || dashcard.action?.id !== action?.id) {
          return dashcard;
        }
        return {
          ...dashcard,
          action: {
            ...action,
            database_enabled_actions:
              dashcard.action?.database_enabled_actions || false,
          },
        };
      }),
  },
  INITIAL_DASHBOARD_STATE.dashcards,
);

const draftParameterValues = handleActions<DraftParameterValuesState, unknown>(
  {
    [INITIALIZE]: {
      next: (
        state: DraftParameterValuesState,
        {
          payload: { clearCache = true } = {},
        }: {
          type: string;
          payload: PayloadFromActionCreator<typeof initialize>;
        },
      ) => {
        return clearCache ? {} : state;
      },
    },
    [fetchDashboard.fulfilled.type]: {
      next: (
        state: DraftParameterValuesState,
        {
          payload: { dashboard, parameterValues, preserveParameters },
        }: ReturnType<typeof fetchDashboard.fulfilled>,
      ) =>
        preserveParameters && !dashboard.auto_apply_filters
          ? state
          : parameterValues,
    },
    [SET_PARAMETER_VALUE]: {
      next: (
        state: DraftParameterValuesState,
        {
          payload: { id, value },
        }: {
          type: string;
          payload: PayloadFromThunkActionCreator<typeof setParameterValue>;
        },
      ) => assoc(state ?? {}, id, value),
    },
    [SET_PARAMETER_VALUES]: {
      next: (
        state: DraftParameterValuesState,
        { payload }: { type: string; payload: DraftParameterValuesState },
      ) => payload,
    },
    [RESET_PARAMETERS]: {
      next: (
        state: DraftParameterValuesState,
        {
          payload: parameters,
        }: {
          type: string;
          payload: PayloadFromThunkActionCreator<typeof resetParameters>;
        },
      ) => {
        return parameters.reduce(
          (result, parameter) => assoc(result, parameter.id, parameter.value),
          state ?? {},
        );
      },
    },
    [REMOVE_PARAMETER]: {
      next: (
        state: DraftParameterValuesState,
        {
          payload: { id },
        }: {
          type: string;
          payload: PayloadFromThunkActionCreator<typeof removeParameter>;
        },
      ) => dissoc(state, id),
    },
  },
  INITIAL_DASHBOARD_STATE.draftParameterValues,
);

const combinedDashboardReducer = combineReducers({
  dashboardId,
  missingActionParameters,
  autoApplyFilters,
  slowCards,
  isNavigatingBackToDashboard,
  isAddParameterPopoverOpen,
  editingDashboard,
  loadingControls,
  sidebar,
  parameterValues,
  dashboards,
  loadingDashCards,
  dashcards,
  dashcardData,
  draftParameterValues,
  // Combined reducer needs to init state for every slice
  selectedTabId: (state = INITIAL_DASHBOARD_STATE.selectedTabId) => state,
  tabDeletions: (state = INITIAL_DASHBOARD_STATE.tabDeletions) => state,
});

export const dashboardReducers = (
  state = INITIAL_DASHBOARD_STATE,
  action: UnknownAction,
) => tabsReducer(combinedDashboardReducer(state, action), action);
