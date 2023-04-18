import type { Action } from "redux-actions";

import {
  DashboardOrderedCard,
  DashboardOrderedTab,
  DashboardTabId,
} from "metabase-types/api";
import { DashboardState } from "metabase-types/store";
import { createAction, handleActions } from "metabase/lib/redux";

import { INITIAL_DASHBOARD_STATE } from "../constants";

type CreateNewTabPayload = { tabId: DashboardTabId };
type DeleteTabPayload = { tabId: DashboardTabId };
type SelectTabPayload = { tabId: DashboardTabId | null };
type SaveCardsAndTabsPayload = {
  cards: DashboardOrderedCard[];
  ordered_tabs: DashboardOrderedTab[];
};
type TabsReducerPayload = CreateNewTabPayload &
  DeleteTabPayload &
  SelectTabPayload &
  SaveCardsAndTabsPayload;

const CREATE_NEW_TAB = "metabase/dashboard/CREATE_NEW_TAB";
const DELETE_TAB = "metabase/dashboard/DELETE_TAB";
const SELECT_TAB = "metabase/dashboard/SELECT_TAB";
const SAVE_CARDS_AND_TABS = "metabase/dashboard/SAVE_CARDS_AND_TABS";
const INIT_TABS = "metabase/dashboard/INIT_TABS";

let tempNewTabId = -1;
export function createNewTab() {
  const action = createAction<CreateNewTabPayload>(CREATE_NEW_TAB);
  return action({ tabId: tempNewTabId-- });
}

export const deleteTab = createAction<DeleteTabPayload>(DELETE_TAB);

export const selectTab = createAction<SelectTabPayload>(SELECT_TAB);

export const saveCardsAndTabs =
  createAction<SaveCardsAndTabsPayload>(SAVE_CARDS_AND_TABS);

export const initTabs = createAction(INIT_TABS);

function getPrevDashAndTabs(state: DashboardState) {
  const dashId = state.dashboardId;
  const prevDash = dashId ? state.dashboards[dashId] : null;
  const prevTabs = prevDash?.ordered_tabs ?? [];

  return { dashId, prevDash, prevTabs };
}

export const tabsReducer = handleActions<DashboardState, TabsReducerPayload>(
  {
    [CREATE_NEW_TAB]: (
      state,
      { payload: { tabId } }: Action<CreateNewTabPayload>,
    ) => {
      const { dashId, prevDash, prevTabs } = getPrevDashAndTabs(state);
      if (!dashId || !prevDash) {
        // TODO consider throwing error
        return state;
      }

      // 1. Create new tab, add to dashboard
      const newTab: DashboardOrderedTab = {
        id: tabId,
        dashboard_id: dashId,
        name: `Page ${prevTabs.length + 1}`,
        entity_id: "",
        created_at: "",
        updated_at: "",
      };
      const dashboards: DashboardState["dashboards"] = {
        ...state.dashboards,
        [dashId]: {
          ...prevDash,
          ordered_tabs: [...prevTabs, newTab],
        },
      };

      // 2. Select new tab
      const selectedTabId = tabId;

      // 3. Update tab id on existing dashcards if this is the first tab added
      // TODO Can we simply this and just set dashcards to updatedDashcards?
      const updatedDashcards: DashboardState["dashcards"] = {};
      if (prevTabs.length === 0) {
        prevDash.ordered_cards.forEach(id => {
          updatedDashcards[id] = {
            ...state.dashcards[id],
            isDirty: true,
            dashboard_tab_id: tabId,
          };
        });
      }
      const dashcards: DashboardState["dashcards"] = {
        ...state.dashcards,
        ...updatedDashcards,
      };

      return {
        ...state,
        dashboards,
        selectedTabId,
        dashcards,
      };
    },
    [DELETE_TAB]: (state, { payload: { tabId } }: Action<DeleteTabPayload>) => {
      const { dashId, prevDash, prevTabs } = getPrevDashAndTabs(state);
      const tabToRemove = prevTabs.find(({ id }) => id === tabId);
      if (!dashId || !prevDash || !tabToRemove) {
        return state;
      }

      // 1. Select a different tab if needed
      let selectedTabId = state.selectedTabId;

      const noTabsRemaining = prevTabs.length === 1;
      const deletingSelectedTab = selectedTabId === tabToRemove.id;
      if (noTabsRemaining) {
        selectedTabId = null;
      } else if (deletingSelectedTab) {
        const tabToRemoveIndex = prevTabs.findIndex(
          ({ id }) => id === tabToRemove.id,
        );
        const targetIndex = tabToRemoveIndex === 0 ? 1 : tabToRemoveIndex - 1;
        selectedTabId = prevTabs[targetIndex].id;
      }

      // 2. Remove the tab
      const newTabs = prevTabs.filter(({ id }) => id !== tabId);
      const dashboards: DashboardState["dashboards"] = {
        ...state.dashboards,
        [dashId]: {
          ...prevDash,
          ordered_tabs: newTabs,
        },
      };

      // 3. Remove dashcards that were on the deleted tab
      const removedCardIds = prevDash.ordered_cards.filter(
        id => state.dashcards[id].dashboard_tab_id === tabId,
      );
      const removedDashcards: DashboardState["dashcards"] = {};
      removedCardIds.forEach(id => {
        removedDashcards[id] = {
          ...state.dashcards[id],
          isRemoved: true,
        };
      });
      const dashcards = { ...state.dashcards, ...removedDashcards };

      return { ...state, selectedTabId, dashboards, dashcards };
    },
    [SELECT_TAB]: (
      state,
      { payload: { tabId } }: Action<SelectTabPayload>,
    ): DashboardState => ({
      ...state,
      selectedTabId: tabId,
    }),
    [SAVE_CARDS_AND_TABS]: (
      state,
      {
        payload: { cards: newCards, ordered_tabs: newTabs },
      }: Action<SaveCardsAndTabsPayload>,
    ) => {
      const { prevDash, prevTabs } = getPrevDashAndTabs(state);
      if (!prevDash) {
        return state;
      }

      // 1. Replace temporary with real dashcard ids
      const dashcardData: DashboardState["dashcardData"] = {};
      const prevCards = prevDash.ordered_cards.filter(
        id => !state.dashcards[id].isRemoved,
      );
      prevCards.forEach((oldId, index) => {
        dashcardData[newCards[index].id] = state.dashcardData[oldId];
      });

      // 2. Re-select the currently selected tab with its real id
      const selectedTabIndex = prevTabs.findIndex(
        tab => tab.id === state.selectedTabId,
      );
      const selectedTabId = newTabs[selectedTabIndex]?.id ?? null;

      return { ...state, dashcardData, selectedTabId };
    },
    [INIT_TABS]: state => {
      const { prevTabs } = getPrevDashAndTabs(state);
      const selectedTabId = prevTabs[0]?.id ?? null;

      return { ...state, selectedTabId };
    },
  },
  INITIAL_DASHBOARD_STATE,
);
