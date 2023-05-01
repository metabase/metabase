import { createAction, createReducer } from "@reduxjs/toolkit";
import type { Draft } from "@reduxjs/toolkit";
import { t } from "ttag";

import {
  DashCardId,
  DashboardId,
  DashboardOrderedCard,
  DashboardOrderedTab,
  DashboardTabId,
} from "metabase-types/api";
import { DashboardState, TabDeletionId } from "metabase-types/store";

import { INITIAL_DASHBOARD_STATE } from "../constants";

type CreateNewTabPayload = { tabId: DashboardTabId };
type DeleteTabPayload = {
  tabId: DashboardTabId | null;
  tabDeletionId: TabDeletionId;
};
type SelectTabPayload = { tabId: DashboardTabId | null };
type RenameTabPayload = { tabId: DashboardTabId | null; name: string };
type SaveCardsAndTabsPayload = {
  cards: DashboardOrderedCard[];
  ordered_tabs: DashboardOrderedTab[];
};

const CREATE_NEW_TAB = "metabase/dashboard/CREATE_NEW_TAB";
const DELETE_TAB = "metabase/dashboard/DELETE_TAB";
const RENAME_TAB = "metabase/dashboard/RENAME_TAB";
const SELECT_TAB = "metabase/dashboard/SELECT_TAB";
const SAVE_CARDS_AND_TABS = "metabase/dashboard/SAVE_CARDS_AND_TABS";
const INIT_TABS = "metabase/dashboard/INIT_TABS";

const createNewTabAction = createAction<CreateNewTabPayload>(CREATE_NEW_TAB);

let tempNewTabId = -2;
export function createNewTab() {
  // Decrement by 2 to leave space for two new tabs if dash doesn't have tabs already
  const tabId = tempNewTabId;
  tempNewTabId -= 2;

  return createNewTabAction({ tabId });
}

const deleteTabAction = createAction<DeleteTabPayload>(DELETE_TAB);

let tabDeletionId = 1;
// TODO convert to thunk and dispatch `addUndo` see `DashboardGrid` for reference
export function deleteTab(tabId: DashboardTabId | null) {
  const id = tabDeletionId++;

  return deleteTabAction({ tabId, tabDeletionId: id });
}

export const selectTab = createAction<SelectTabPayload>(SELECT_TAB);

export const renameTab = createAction<RenameTabPayload>(RENAME_TAB);

export const saveCardsAndTabs =
  createAction<SaveCardsAndTabsPayload>(SAVE_CARDS_AND_TABS);

export const initTabs = createAction(INIT_TABS);

function getPrevDashAndTabs(state: Draft<DashboardState>) {
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

export const tabsReducer = createReducer<DashboardState>(
  INITIAL_DASHBOARD_STATE,
  builder => {
    builder.addCase(createNewTabAction, (state, { payload: { tabId } }) => {
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
    });

    builder.addCase(
      deleteTabAction,
      (state, { payload: { tabId, tabDeletionId } }) => {
        const { dashId, prevDash, prevTabs } = getPrevDashAndTabs(state);
        const tabToRemove = prevTabs.find(({ id }) => id === tabId);
        if (!dashId || !prevDash || !tabToRemove) {
          throw Error(
            `DELETE_TAB was dispatched but either dashId (${dashId}), prevDash (${prevDash}), or tabToRemove (${tabToRemove}) is null/undefined`,
          );
        }

        // 1. Select a different tab if needed
        const noTabsRemaining = prevTabs.length === 1;
        const deletingSelectedTab = state.selectedTabId === tabToRemove.id;
        if (noTabsRemaining) {
          state.selectedTabId = null;
        } else if (deletingSelectedTab) {
          const tabToRemoveIndex = prevTabs.findIndex(
            ({ id }) => id === tabToRemove.id,
          );
          const targetIndex = tabToRemoveIndex === 0 ? 1 : tabToRemoveIndex - 1;
          state.selectedTabId = prevTabs[targetIndex].id;
        }

        // 2. Mark the tab as removed
        tabToRemove.isRemoved = true;

        // 3. Mark dashcards on removed tab as removed
        const removedDashCardIds: DashCardId[] = [];
        prevDash.ordered_cards.forEach(id => {
          if (state.dashcards[id].dashboard_tab_id === tabToRemove.id) {
            state.dashcards[id].isRemoved = true;
            removedDashCardIds.push(id);
          }
        });

        // 4. Add deletion to history to allow undoing
        state.tabDeletions[tabDeletionId] = {
          id: tabDeletionId,
          tabId: tabToRemove.id,
          removedDashCardIds,
        };
      },
    );

    builder.addCase(renameTab, (state, { payload: { tabId, name } }) => {
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
    });

    builder.addCase(selectTab, (state, { payload: { tabId } }) => ({
      ...state,
      selectedTabId: tabId,
    }));

    builder.addCase(
      saveCardsAndTabs,
      (state, { payload: { cards: newCards, ordered_tabs: newTabs } }) => {
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
    );

    builder.addCase(initTabs, state => {
      const { prevTabs } = getPrevDashAndTabs(state);
      const selectedTabId = prevTabs[0]?.id ?? null;

      return { ...state, selectedTabId };
    });
  },
);
