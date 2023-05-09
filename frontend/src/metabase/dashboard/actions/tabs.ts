import type { Action } from "redux-actions";
import { t } from "ttag";

import {
  DashboardId,
  DashboardOrderedCard,
  DashboardOrderedTab,
  DashboardTabId,
} from "metabase-types/api";
import { DashboardState } from "metabase-types/store";
import { createAction, handleActions } from "metabase/lib/redux";

import { INITIAL_DASHBOARD_STATE } from "../constants";

type CreateNewTabPayload = { tabId: DashboardTabId };
type DeleteTabPayload = { tabId: DashboardTabId | null };
type SelectTabPayload = { tabId: DashboardTabId | null };
type RenameTabPayload = { tabId: DashboardTabId | null; name: string };
type SaveCardsAndTabsPayload = {
  cards: DashboardOrderedCard[];
  ordered_tabs: DashboardOrderedTab[];
};
type TabsReducerPayload = CreateNewTabPayload &
  DeleteTabPayload &
  SelectTabPayload &
  RenameTabPayload &
  SaveCardsAndTabsPayload;

const CREATE_NEW_TAB = "metabase/dashboard/CREATE_NEW_TAB";
const DELETE_TAB = "metabase/dashboard/DELETE_TAB";
const RENAME_TAB = "metabase/dashboard/RENAME_TAB";
const SELECT_TAB = "metabase/dashboard/SELECT_TAB";
const SAVE_CARDS_AND_TABS = "metabase/dashboard/SAVE_CARDS_AND_TABS";
const INIT_TABS = "metabase/dashboard/INIT_TABS";

let tempNewTabId = -2;
export function createNewTab() {
  // Decrement by 2 to leave space for two new tabs if dash doesn't have tabs already
  const tabId = tempNewTabId;
  tempNewTabId -= 2;

  const action = createAction<CreateNewTabPayload>(CREATE_NEW_TAB);
  return action({ tabId });
}

export const deleteTab = createAction<DeleteTabPayload>(DELETE_TAB);

export const selectTab = createAction<SelectTabPayload>(SELECT_TAB);

export const renameTab = createAction<RenameTabPayload>(RENAME_TAB);

export const saveCardsAndTabs =
  createAction<SaveCardsAndTabsPayload>(SAVE_CARDS_AND_TABS);

export const initTabs = createAction(INIT_TABS);

function getPrevDashAndTabs(state: DashboardState) {
  const dashId = state.dashboardId;
  const prevDash = dashId ? state.dashboards[dashId] : null;
  const prevTabs = prevDash?.ordered_tabs ?? [];

  return { dashId, prevDash, prevTabs };
}

export function getDefaultTab({
  tabId,
  dashId,
  name,
}: {
  tabId: DashboardTabId;
  dashId: DashboardId;
  name: string;
}) {
  return {
    id: tabId,
    dashboard_id: dashId,
    name,
    entity_id: "",
    created_at: "",
    updated_at: "",
  };
}

export const tabsReducer = handleActions<DashboardState, TabsReducerPayload>(
  {
    [CREATE_NEW_TAB]: (
      state,
      { payload: { tabId } }: Action<CreateNewTabPayload>,
    ) => {
      const { dashId, prevDash, prevTabs } = getPrevDashAndTabs(state);
      if (!dashId || !prevDash) {
        throw Error(
          `CREATE_NEW_TAB was dispatched but either dashId (${dashId}) or prevDash (${prevDash}) are null`,
        );
      }

      // Case 1: Dashboard already has tabs
      if (prevTabs.length !== 0) {
        // 1. Create new tab, add to dashboard
        const newTab = getDefaultTab({
          tabId,
          dashId,
          name: t`Page ${prevTabs.length + 1}`,
        });
        const dashboards: DashboardState["dashboards"] = {
          ...state.dashboards,
          [dashId]: {
            ...prevDash,
            ordered_tabs: [...prevTabs, newTab],
          },
        };

        // 2. Select new tab
        const selectedTabId = tabId;

        return { ...state, dashboards, selectedTabId };
      }

      // Case 2: Dashboard doesn't have tabs

      // 1. Create two new tabs, add to dashboard
      const firstTabId = tabId + 1;
      const secondTabId = tabId;
      const newTabs = [
        getDefaultTab({ tabId: firstTabId, dashId, name: t`Page 1` }),
        getDefaultTab({ tabId: secondTabId, dashId, name: t`Page 2` }),
      ];
      const dashboards: DashboardState["dashboards"] = {
        ...state.dashboards,
        [dashId]: {
          ...prevDash,
          ordered_tabs: [...prevTabs, ...newTabs],
        },
      };

      // 2. Select second tab
      const selectedTabId = secondTabId;

      // 3. Assign existing dashcards to first tab
      const dashcards: DashboardState["dashcards"] = { ...state.dashcards };
      if (prevTabs.length === 0) {
        prevDash.ordered_cards.forEach(id => {
          dashcards[id] = {
            ...state.dashcards[id],
            isDirty: true,
            dashboard_tab_id: firstTabId,
          };
        });
      }

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
        throw Error(
          `DELETE_TAB was dispatched but either dashId (${dashId}), prevDash (${prevDash}), or tabToRemove (${tabToRemove}) is null/undefined`,
        );
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
    [RENAME_TAB]: (
      state,
      { payload: { tabId, name } }: Action<RenameTabPayload>,
    ) => {
      const { dashId, prevDash, prevTabs } = getPrevDashAndTabs(state);
      const tabToRename = prevTabs.find(({ id }) => id === tabId);
      if (!dashId || !prevDash || !tabToRename) {
        throw Error(
          `RENAME_TAB was dispatched but either dashId (${dashId}), prevDash (${prevDash}), or tabToRename (${tabToRename}) is null/undefined`,
        );
      }

      const tabToRenameIndex = prevTabs.findIndex(
        ({ id }) => id === tabToRename.id,
      );
      const newTabs = [...prevTabs];
      newTabs[tabToRenameIndex] = { ...tabToRename, name };

      const dashboards: DashboardState["dashboards"] = {
        ...state.dashboards,
        [dashId]: {
          ...prevDash,
          ordered_tabs: newTabs,
        },
      };

      return { ...state, dashboards };
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
        throw Error(
          `SAVE_CARDS_AND_TABS was dispatched but prevDash (${prevDash}) is null`,
        );
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
