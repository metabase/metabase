import { type UnknownAction, createReducer } from "@reduxjs/toolkit";
import { assoc, chain, merge, updateIn } from "icepick";

import { Actions } from "metabase/entities/actions";
import { Questions } from "metabase/entities/questions";
import { combineReducers } from "metabase/lib/redux";
import type { Card, WritebackAction } from "metabase-types/api";

import {
  REMOVE_CARD_FROM_DASH,
  REMOVE_PARAMETER,
  RESET_PARAMETERS,
  SET_PARAMETER_VALUE,
  SET_PARAMETER_VALUES,
  UNDO_REMOVE_CARD_FROM_DASH,
  addCardToDash,
  addManyCardsToDash,
  fetchDashboard,
  initialize,
  markNewCardSeen,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardColumnSettings,
  onUpdateDashCardVisualizationSettings,
  type removeCardFromDashboard,
  type removeParameter,
  type resetParameters,
  setDashCardAttributes,
  setMultipleDashCardAttributes,
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

type PayloadFromThunkActionCreator<T extends (...args: any[]) => any> =
  ReturnType<T> extends (...args: any[]) => Promise<infer TResult>
    ? TResult extends { payload: infer TPayload }
      ? TPayload
      : never
    : never;

type DraftParameterValuesState =
  typeof INITIAL_DASHBOARD_STATE.draftParameterValues;

const dashcards = createReducer(
  INITIAL_DASHBOARD_STATE.dashcards,
  (builder) => {
    builder
      .addCase(fetchDashboard.fulfilled, (state, action) => ({
        ...state,
        ...action.payload.entities.dashcard,
      }))
      .addCase(
        setDashCardAttributes,
        (state, { payload: { id, attributes } }) => {
          const dashcard = state[id];
          if (!dashcard) {
            return;
          }
          Object.assign(dashcard, attributes);
          dashcard.isDirty = true;
        },
      )
      .addCase(
        setMultipleDashCardAttributes,
        (state, { payload: { dashcards } }) => {
          dashcards.forEach(({ id, attributes }) => {
            const dashcard = state[id];
            if (!dashcard) {
              return;
            }
            Object.assign(dashcard, attributes);
            dashcard.isDirty = true;
          });
        },
      )
      .addCase(
        onUpdateDashCardVisualizationSettings,
        (state, { payload: { id, settings } }) =>
          chain(state)
            .updateIn([id, "visualization_settings"], (value = {}) => ({
              ...value,
              ...settings,
            }))
            .assocIn([id, "isDirty"], true)
            .value(),
      )
      .addCase(
        onUpdateDashCardColumnSettings,
        (state, { payload: { column, id, settings } }) =>
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
      )
      .addCase(
        onReplaceAllDashCardVisualizationSettings,
        (state, { payload: { id, settings } }) =>
          chain(state)
            .assocIn([id, "visualization_settings"], settings)
            .assocIn([id, "isDirty"], true)
            .value(),
      )
      .addCase(addCardToDash, (state, { payload: dashcard }) => {
        // @ts-expect-error -- NewDashboardCard is a partial StoreDashcard, safe to assign here
        state[dashcard.id] = {
          ...dashcard,
          isAdded: true,
          justAdded: true,
        };
      })
      .addCase(addManyCardsToDash, (state, { payload: dashcards }) => {
        dashcards.forEach((dc, index) => {
          // @ts-expect-error -- NewDashboardCard is a partial StoreDashcard, safe to assign here
          state[dc.id] = {
            ...dc,
            isAdded: true,
            justAdded: index === 0,
          };
        });
      })
      .addCase<
        string,
        {
          type: string;
          payload: PayloadFromThunkActionCreator<
            typeof removeCardFromDashboard
          >;
        }
      >(REMOVE_CARD_FROM_DASH, (state, { payload: { dashcardId } }) => {
        if (state[dashcardId]) {
          state[dashcardId].isRemoved = true;
        }
      })
      .addCase<
        string,
        {
          type: string;
          payload: PayloadFromThunkActionCreator<
            typeof undoRemoveCardFromDashboard
          >;
        }
      >(UNDO_REMOVE_CARD_FROM_DASH, (state, { payload: { dashcardId } }) => {
        if (!state[dashcardId]) {
          return;
        }
        state[dashcardId].isRemoved = false;
        state[dashcardId].row = calculateDashCardRowAfterUndo(
          state[dashcardId].row,
        );
      })
      .addCase(markNewCardSeen, (state, { payload: dashcardId }) => {
        if (state[dashcardId]) {
          state[dashcardId].justAdded = false;
        }
      })
      .addCase<
        string,
        { type: string; payload: { object: Card | null | undefined } }
      >(
        Questions.actionTypes.UPDATE,
        (state, { payload: { object: card } }) => {
          if (!card) {
            return;
          }
          Object.values(state).forEach((dashcard) => {
            if (dashcard.card?.id === card.id) {
              Object.assign(dashcard.card, card);
            }
          });
        },
      )
      .addCase<
        string,
        {
          type: string;
          payload: { object: WritebackAction | null | undefined };
        }
      >(
        Actions.actionTypes.UPDATE,
        (state, { payload: { object: action } }) => {
          if (!action) {
            return;
          }
          Object.values(state).forEach((dashcard) => {
            if (!("action" in dashcard) || dashcard.action?.id !== action.id) {
              return;
            }
            Object.assign(dashcard.action, action, {
              database_enabled_actions:
                dashcard.action.database_enabled_actions || false,
            });
          });
        },
      );
  },
);

const draftParameterValues = createReducer(
  INITIAL_DASHBOARD_STATE.draftParameterValues,
  (builder) => {
    builder
      .addCase(initialize, (state, { payload: { clearCache = true } = {} }) => {
        return clearCache ? {} : state;
      })
      .addCase(fetchDashboard.fulfilled, (state, { payload }) =>
        payload.preserveParameters && !payload.dashboard.auto_apply_filters
          ? state
          : payload.parameterValues,
      )
      .addCase<
        string,
        {
          type: string;
          payload: PayloadFromThunkActionCreator<typeof setParameterValue>;
        }
      >(SET_PARAMETER_VALUE, (state, { payload: { id, value } }) =>
        assoc(state ?? {}, id, value),
      )
      .addCase<string, { type: string; payload: DraftParameterValuesState }>(
        SET_PARAMETER_VALUES,
        (_state, { payload }) => payload,
      )
      .addCase<
        string,
        {
          type: string;
          payload: PayloadFromThunkActionCreator<typeof resetParameters>;
        }
      >(RESET_PARAMETERS, (state, { payload: parameters }) =>
        parameters.forEach((parameter) => {
          state[parameter.id] = parameter.value;
        }),
      )
      .addCase<
        string,
        {
          type: string;
          payload: PayloadFromThunkActionCreator<typeof removeParameter>;
        }
      >(REMOVE_PARAMETER, (state, { payload: { id } }) => {
        delete state[id];
      });
  },
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
