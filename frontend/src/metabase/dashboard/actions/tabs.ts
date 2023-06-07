import { createAction, createReducer } from "@reduxjs/toolkit";
import type { Draft } from "@reduxjs/toolkit";
import { t } from "ttag";
import { arrayMove } from "@dnd-kit/sortable";

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
type UndoDeleteTabPayload = {
  tabDeletionId: TabDeletionId;
};
type RenameTabPayload = { tabId: DashboardTabId | null; name: string };
type MoveTabPayload = {
  sourceTabId: DashboardTabId;
  destTabId: DashboardTabId;
};
type SelectTabPayload = { tabId: DashboardTabId | null };
type SaveCardsAndTabsPayload = {
  cards: DashboardOrderedCard[];
  ordered_tabs: DashboardOrderedTab[];
};

const CREATE_NEW_TAB = "metabase/dashboard/CREATE_NEW_TAB";
const DELETE_TAB = "metabase/dashboard/DELETE_TAB";
const UNDO_DELETE_TAB = "metabase/dashboard/UNDO_DELETE_TAB";
const RENAME_TAB = "metabase/dashboard/RENAME_TAB";
const MOVE_TAB = "metabase/dashboard/MOVE_TAB";
const SELECT_TAB = "metabase/dashboard/SELECT_TAB";
const SAVE_CARDS_AND_TABS = "metabase/dashboard/SAVE_CARDS_AND_TABS";
const INIT_TABS = "metabase/dashboard/INIT_TABS";

const createNewTabAction = createAction<CreateNewTabPayload>(CREATE_NEW_TAB);

let tempTabId = -2;
// Needed for testing
export function resetTempTabId() {
  tempTabId = -2;
}

export function createNewTab() {
  // Decrement by 2 to leave space for two new tabs if dash doesn't have tabs already
  const tabId = tempTabId;
  tempTabId -= 2;

  return createNewTabAction({ tabId });
}

export const deleteTab = createAction<DeleteTabPayload>(DELETE_TAB);

export const undoDeleteTab =
  createAction<UndoDeleteTabPayload>(UNDO_DELETE_TAB);

export const renameTab = createAction<RenameTabPayload>(RENAME_TAB);

export const moveTab = createAction<MoveTabPayload>(MOVE_TAB);

export const selectTab = createAction<SelectTabPayload>(SELECT_TAB);

export const saveCardsAndTabs =
  createAction<SaveCardsAndTabsPayload>(SAVE_CARDS_AND_TABS);

export const initTabs = createAction(INIT_TABS);

function getPrevDashAndTabs({
  state,
  filterRemovedTabs = false,
}: {
  state: Draft<DashboardState>;
  filterRemovedTabs?: boolean;
}) {
  const dashId = state.dashboardId;
  const prevDash = dashId ? state.dashboards[dashId] : null;
  const prevTabs =
    prevDash?.ordered_tabs?.filter(t => !filterRemovedTabs || !t.isRemoved) ??
    [];

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
    builder.addCase<typeof createNewTabAction>(
      createNewTabAction,
      (state, { payload: { tabId } }) => {
        const { dashId, prevDash, prevTabs } = getPrevDashAndTabs({ state });
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
            name: t`Tab ${prevTabs.filter(t => !t.isRemoved).length + 1}`,
          });
          prevDash.ordered_tabs = [...prevTabs, newTab];

          // 2. Select new tab
          state.selectedTabId = tabId;
          return;
        }

        // Case 2: Dashboard doesn't have tabs

        // 1. Create two new tabs, add to dashboard
        const firstTabId = tabId + 1;
        const secondTabId = tabId;
        const newTabs = [
          getDefaultTab({ tabId: firstTabId, dashId, name: t`Tab 1` }),
          getDefaultTab({ tabId: secondTabId, dashId, name: t`Tab 2` }),
        ];
        prevDash.ordered_tabs = [...prevTabs, ...newTabs];

        // 2. Select second tab
        state.selectedTabId = secondTabId;

        // 3. Assign existing dashcards to first tab
        prevDash.ordered_cards.forEach(id => {
          state.dashcards[id] = {
            ...state.dashcards[id],
            isDirty: true,
            dashboard_tab_id: firstTabId,
          };
        });
      },
    );

    builder.addCase(
      deleteTab,
      (state, { payload: { tabId, tabDeletionId } }) => {
        const { prevDash, prevTabs } = getPrevDashAndTabs({
          state,
          filterRemovedTabs: true,
        });
        const tabToRemove = prevTabs.find(({ id }) => id === tabId);
        if (!prevDash || !tabToRemove) {
          throw Error(
            `DELETE_TAB was dispatched but either prevDash (${prevDash}), or tabToRemove (${tabToRemove}) is null/undefined`,
          );
        }

        // 1. Select a different tab if needed
        if (state.selectedTabId === tabToRemove.id) {
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

    builder.addCase(undoDeleteTab, (state, { payload: { tabDeletionId } }) => {
      const { prevTabs } = getPrevDashAndTabs({ state });
      const { tabId, removedDashCardIds } = state.tabDeletions[tabDeletionId];
      const removedTab = prevTabs.find(({ id }) => id === tabId);
      if (!removedTab) {
        throw Error(
          `UNDO_DELETE_TAB was dispatched but tab with id ${tabId} was not found`,
        );
      }

      // 1. Unmark tab as removed
      removedTab.isRemoved = false;

      // 2. Unmark dashcards as removed
      removedDashCardIds.forEach(id => (state.dashcards[id].isRemoved = false));

      // 3. Remove deletion from history
      delete state.tabDeletions[tabDeletionId];
    });

    builder.addCase(renameTab, (state, { payload: { tabId, name } }) => {
      const { prevTabs } = getPrevDashAndTabs({ state });
      const tabToRenameIndex = prevTabs.findIndex(({ id }) => id === tabId);

      if (tabToRenameIndex === -1) {
        throw Error(
          `RENAME_TAB was dispatched but tabToRenameIndex (${tabToRenameIndex}) is invalid`,
        );
      }

      prevTabs[tabToRenameIndex].name = name;
    });

    builder.addCase(
      moveTab,
      (state, { payload: { sourceTabId, destTabId } }) => {
        const { prevDash, prevTabs } = getPrevDashAndTabs({ state });
        const sourceTabIndex = prevTabs.findIndex(
          ({ id }) => id === sourceTabId,
        );
        const destTabIndex = prevTabs.findIndex(({ id }) => id === destTabId);

        if (!prevDash || sourceTabIndex === -1 || destTabIndex === -1) {
          throw Error(
            `MOVE_TAB was dispatched but either prevDash (${JSON.stringify(
              prevDash,
            )}), sourceTabIndex (${sourceTabIndex}) or destTabIndex (${destTabIndex}) is invalid`,
          );
        }

        prevDash.ordered_tabs = arrayMove(
          prevTabs,
          sourceTabIndex,
          destTabIndex,
        );
      },
    );

    builder.addCase(selectTab, (state, { payload: { tabId } }) => {
      state.selectedTabId = tabId;
    });

    builder.addCase(
      saveCardsAndTabs,
      (state, { payload: { cards: newCards, ordered_tabs: newTabs } }) => {
        const { prevDash, prevTabs } = getPrevDashAndTabs({ state });
        if (!prevDash) {
          throw Error(
            `SAVE_CARDS_AND_TABS was dispatched but prevDash (${prevDash}) is null`,
          );
        }

        // 1. Replace temporary with real dashcard ids
        const prevCards = prevDash.ordered_cards.filter(
          id => !state.dashcards[id].isRemoved,
        );
        prevCards.forEach((oldId, index) => {
          state.dashcardData[newCards[index].id] = state.dashcardData[oldId];
        });

        // 2. Re-select the currently selected tab with its real id
        const selectedTabIndex = prevTabs.findIndex(
          tab => tab.id === state.selectedTabId,
        );
        state.selectedTabId = newTabs[selectedTabIndex]?.id ?? null;
      },
    );

    builder.addCase(initTabs, state => {
      const { prevTabs } = getPrevDashAndTabs({ state });
      state.selectedTabId = prevTabs[0]?.id ?? null;
    });
  },
);
