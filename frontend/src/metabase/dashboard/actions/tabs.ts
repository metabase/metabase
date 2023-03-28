import type { Action } from "redux-actions";

import {
  CardId,
  DashboardId,
  DashboardOrderedTab,
  DashboardTabId,
} from "metabase-types/api";
import { Dispatch, State } from "metabase-types/store";
import { createAction, handleActions } from "metabase/lib/redux";

import { INITIAL_DASHBOARD_STATE } from "../constants";
import { setMultipleDashCardAttributes, removeCardFromDashboard } from "./core";

// TODO consider reorgnaizing this file, e.g. have all action type strings in one place, all types, etc

const ADD_TAB_TO_DASH = "metabase/dashboard/ADD_TAB_TO_DASH";

type AddTabToDashPayload = { tab: DashboardOrderedTab };
export const addTabToDash = createAction<AddTabToDashPayload>(ADD_TAB_TO_DASH);

const REMOVE_TAB_FROM_DASH = "metabase/dashboard/REMOVE_TAB_FROM_DASH";

type RemoveTabFromDashPayload = { tabId: DashboardTabId; dashId: DashboardId };
export function removeTabFromDash(tabId: DashboardTabId) {
  return (dispatch: Dispatch, getState: () => State) => {
    // step 1: get all the card ids on the current dashboard that have the tab id
    const state = getState();
    const cardIds = state.dashboard.dashboards[
      state.dashboard.dashboardId ?? 0
    ].ordered_cards.filter(
      id => state.dashboard.dashcards[id].dashboardtab_id === tabId,
    );

    // step 2: remove them all
    // TODO create bulk removal action
    cardIds.forEach(dashcardId =>
      dispatch(removeCardFromDashboard({ dashcardId })),
    );

    // step 3: dispatch REMOVE_TAB_FROM_DASH
    const action = createAction<RemoveTabFromDashPayload>(REMOVE_TAB_FROM_DASH);
    // todo fix 0 null check
    dispatch(action({ tabId, dashId: state.dashboard.dashboardId ?? 0 }));
  };
}

export function addCardsToTab({
  cardIds,
  tabId,
}: {
  cardIds: CardId[];
  tabId: DashboardTabId;
}) {
  return (dispatch: Dispatch) =>
    dispatch(
      setMultipleDashCardAttributes({
        dashcards: cardIds.map(id => ({
          id,
          attributes: { dashboardtab_id: tabId },
        })),
      }),
    );
}

const SELECT_TAB = "metabase/dashboard/SELECT_TAB";

type SelectTabPayload = { tabId: DashboardTabId | null };
export const selectTab = createAction<SelectTabPayload>(SELECT_TAB);

export const tabsReducer = handleActions<
  State["dashboard"],
  AddTabToDashPayload & RemoveTabFromDashPayload & SelectTabPayload
>(
  {
    [ADD_TAB_TO_DASH]: (
      state,
      { payload: { tab } }: Action<AddTabToDashPayload>,
    ) => {
      const dashId = tab.dashboard_id;
      const prevDash = state.dashboards[dashId];

      return {
        ...state,
        dashboards: {
          ...state.dashboards,
          [dashId]: {
            ...prevDash,
            ordered_tabs: [...(prevDash.ordered_tabs ?? []), tab],
          },
        },
      };
    },
    [REMOVE_TAB_FROM_DASH]: (
      state,
      { payload: { tabId, dashId } }: Action<RemoveTabFromDashPayload>,
    ) => {
      const prevDash = state.dashboards[dashId];

      return {
        ...state,
        dashboards: {
          ...state.dashboards,
          [dashId]: {
            ...prevDash,
            ordered_tabs: (prevDash.ordered_tabs ?? []).filter(
              ({ id }) => id !== tabId,
            ),
          },
        },
      };
    },
    [SELECT_TAB]: (
      state,
      { payload: { tabId } }: Action<SelectTabPayload>,
    ): State["dashboard"] => ({
      ...state,
      selectedTabId: tabId,
    }),
  },
  INITIAL_DASHBOARD_STATE,
);
