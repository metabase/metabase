import { arrayMove } from "@dnd-kit/sortable";
import type { Draft } from "@reduxjs/toolkit";
import { createAction, createReducer } from "@reduxjs/toolkit";
import { t } from "ttag";

import {
  CANCEL_EDITING_DASHBOARD,
  INITIALIZE,
} from "metabase/dashboard/actions/core";
import Dashboards from "metabase/entities/dashboards";
import { getPositionForNewDashCard } from "metabase/lib/dashboard_grid";
import { checkNotNull } from "metabase/lib/types";
import { addUndo } from "metabase/redux/undo";
import type {
  DashCardId,
  DashboardId,
  DashboardTabId,
} from "metabase-types/api";
import type {
  DashboardState,
  Dispatch,
  GetState,
  SelectedTabId,
  StoreDashboard,
  TabDeletionId,
} from "metabase-types/store";

import { trackCardMoved } from "../analytics";
import { INITIAL_DASHBOARD_STATE } from "../constants";
import { getDashCardById } from "../selectors";
import {
  calculateDashCardRowAfterUndo,
  generateTemporaryDashcardId,
  isVirtualDashCard,
} from "../utils";

import { getDashCardMoveToTabUndoMessage, getExistingDashCards } from "./utils";

type CreateNewTabPayload = { tabId: DashboardTabId };
type DuplicateTabPayload = {
  sourceTabId: DashboardTabId | null;
  newTabId: DashboardTabId;
};
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
  destinationTabId: DashboardTabId;
};
type SelectTabPayload = { tabId: DashboardTabId | null };
type MoveDashCardToTabPayload = {
  dashCardId: DashCardId;
  destinationTabId: DashboardTabId;
};
type UndoMoveDashCardToTabPayload = {
  dashCardId: DashCardId;
  originalCol: number;
  originalRow: number;
  originalTabId: number;
};
type InitTabsPayload = { slug: string | undefined };

const CREATE_NEW_TAB = "metabase/dashboard/CREATE_NEW_TAB";
const DUPLICATE_TAB = "metabase/dashboard/DUPLICATE_TAB";
const DELETE_TAB = "metabase/dashboard/DELETE_TAB";
const UNDO_DELETE_TAB = "metabase/dashboard/UNDO_DELETE_TAB";
const RENAME_TAB = "metabase/dashboard/RENAME_TAB";
const MOVE_TAB = "metabase/dashboard/MOVE_TAB";
const SELECT_TAB = "metabase/dashboard/SELECT_TAB";
const MOVE_DASHCARD_TO_TAB = "metabase/dashboard/MOVE_DASHCARD_TO_TAB";
const UNDO_MOVE_DASHCARD_TO_TAB =
  "metabase/dashboard/UNDO_MOVE_DASHCARD_TO_TAB";
const INIT_TABS = "metabase/dashboard/INIT_TABS";

const createNewTabAction = createAction<CreateNewTabPayload>(CREATE_NEW_TAB);

let tempTabId = -2;

// Needed for testing
export function resetTempTabId() {
  tempTabId = -2;
}

function _createInitialTabs({
  dashId,
  newTabId,
  state,
  prevDash,
  firstTabName = t`Tab 1`,
  secondTabName = t`Tab 2`,
}: {
  dashId: DashboardId;
  newTabId: DashboardTabId;
  state: Draft<DashboardState> | DashboardState; // union type needed to fix `possibly infinite` type error
  prevDash: StoreDashboard;
  firstTabName?: string;
  secondTabName?: string;
}) {
  // 1. Create two new tabs, add to dashboard
  const firstTabId = newTabId + 1;
  const secondTabId = newTabId;
  const newTabs = [
    getDefaultTab({ tabId: firstTabId, dashId, name: firstTabName }),
    getDefaultTab({ tabId: secondTabId, dashId, name: secondTabName }),
  ];
  prevDash.tabs = newTabs;

  // 2. Assign existing dashcards to first tab
  prevDash.dashcards.forEach(id => {
    state.dashcards[id] = {
      ...state.dashcards[id],
      isDirty: true,
      dashboard_tab_id: firstTabId,
    };
  });

  return { firstTabId, secondTabId };
}

export function createNewTab() {
  // Decrement by 2 to leave space for two new tabs if dash doesn't have tabs already
  const tabId = tempTabId;
  tempTabId -= 2;

  return createNewTabAction({ tabId });
}

const duplicateTabAction = createAction<DuplicateTabPayload>(DUPLICATE_TAB);

export function duplicateTab(sourceTabId: DashboardTabId | null) {
  // Decrement by 2 to leave space for two new tabs if dash doesn't have tabs already
  const newTabId = tempTabId;
  tempTabId -= 2;

  return duplicateTabAction({ sourceTabId, newTabId });
}

export const selectTab = createAction<SelectTabPayload>(SELECT_TAB);

function _selectTab({
  state,
  tabId,
}: {
  state: Draft<DashboardState>;
  tabId: SelectedTabId;
}) {
  state.selectedTabId = tabId;
}

export const deleteTab = createAction<DeleteTabPayload>(DELETE_TAB);

export const undoDeleteTab =
  createAction<UndoDeleteTabPayload>(UNDO_DELETE_TAB);

export const renameTab = createAction<RenameTabPayload>(RENAME_TAB);

export const moveTab = createAction<MoveTabPayload>(MOVE_TAB);

export const moveDashCardToTab =
  ({ destinationTabId, dashCardId }: MoveDashCardToTabPayload) =>
  (dispatch: Dispatch, getState: GetState) => {
    const dashCard = getDashCardById(getState(), dashCardId);

    const originalCol = dashCard.col;
    const originalRow = dashCard.row;
    const originalTabId = checkNotNull(dashCard.dashboard_tab_id);

    dispatch(_moveDashCardToTab({ destinationTabId, dashCardId }));

    dispatch(
      addUndo({
        message: getDashCardMoveToTabUndoMessage(dashCard),
        undo: true,
        action: () => {
          dispatch(
            undoMoveDashCardToTab({
              dashCardId,
              originalCol,
              originalRow,
              originalTabId,
            }),
          );
        },
      }),
    );

    trackCardMoved(dashCard.dashboard_id);
  };

const _moveDashCardToTab =
  createAction<MoveDashCardToTabPayload>(MOVE_DASHCARD_TO_TAB);

export const undoMoveDashCardToTab = createAction<UndoMoveDashCardToTabPayload>(
  UNDO_MOVE_DASHCARD_TO_TAB,
);

export const initTabs = createAction<InitTabsPayload>(INIT_TABS);

export function getPrevDashAndTabs({
  state,
  filterRemovedTabs = false,
}: {
  state: Draft<DashboardState> | DashboardState;
  filterRemovedTabs?: boolean;
}) {
  const dashId = state.dashboardId;
  const prevDash = dashId ? state.dashboards[dashId] : null;
  const prevTabs =
    prevDash?.tabs?.filter(t => !filterRemovedTabs || !t.isRemoved) ?? [];

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

export function getIdFromSlug(slug: string | undefined) {
  if (!slug) {
    return undefined;
  }

  const id = Number(slug.split("-")[0]);
  return Number.isNaN(id) ? undefined : id;
}

export const tabsReducer = createReducer<DashboardState>(
  INITIAL_DASHBOARD_STATE,
  builder => {
    builder.addCase<typeof createNewTabAction>(
      createNewTabAction,
      (state, { payload: { tabId } }) => {
        const { dashId, prevDash, prevTabs } = getPrevDashAndTabs({ state });
        if (!dashId || !prevDash) {
          throw new Error(
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
          prevDash.tabs = [...prevTabs, newTab];

          // 2. Select new tab
          state.selectedTabId = tabId;
          return;
        }

        // Case 2: Dashboard doesn't have tabs

        // 1. Create two new tabs, add to dashboard, assign existing dashcards to first tab
        const { secondTabId } = _createInitialTabs({
          dashId,
          newTabId: tabId,
          state,
          prevDash,
        });

        // 2. Select second tab
        state.selectedTabId = secondTabId;
      },
    );

    builder.addCase<typeof duplicateTabAction>(
      duplicateTabAction,
      (state, { payload: { sourceTabId, newTabId } }) => {
        const { dashId, prevDash, prevTabs } = getPrevDashAndTabs({ state });
        if (!dashId || !prevDash) {
          throw new Error(
            `DUPLICATE_TAB was dispatched but either dashId (${dashId}) or prevDash (${prevDash}) are null`,
          );
        }
        const sourceTab = prevTabs.find(tab => tab.id === sourceTabId);
        if (sourceTabId !== null && !sourceTab) {
          throw new Error(
            `DUPLICATED_TAB was dispatched but no tab with sourceTabId ${sourceTabId} was found`,
          );
        }

        // 1. Create empty tab(s)

        // Case 1: Dashboard already has tabs
        if (sourceTab !== undefined) {
          const newTab = getDefaultTab({
            tabId: newTabId,
            dashId,
            name: t`Copy of ${sourceTab.name}`,
          });
          prevDash.tabs = [...prevTabs, newTab];

          // Case 2: Dashboard doesn't have tabs
        } else {
          const { firstTabId, secondTabId } = _createInitialTabs({
            dashId,
            prevDash,
            state,
            newTabId,
            firstTabName: t`Tab 1`,
            secondTabName: t`Copy of Tab 1`,
          });
          sourceTabId = firstTabId;
          newTabId = secondTabId;
        }

        // 2. Duplicate dashcards
        const sourceTabDashCards = prevDash.dashcards
          .map(id => state.dashcards[id])
          .filter(dashCard => dashCard.dashboard_tab_id === sourceTabId);

        sourceTabDashCards.forEach(sourceDashCard => {
          const newDashCardId = generateTemporaryDashcardId();

          prevDash.dashcards.push(newDashCardId);

          state.dashcards[newDashCardId] = {
            ...sourceDashCard,
            id: newDashCardId,
            dashboard_tab_id: newTabId,
            isDirty: true,
          };

          // We don't have card (question) data for virtual dashcards (text, heading, link, action)
          // @ts-expect-error - possibly infinite type error
          if (isVirtualDashCard(sourceDashCard)) {
            return;
          }
          if (sourceDashCard.card_id == null) {
            throw Error("sourceDashCard is non-virtual yet has null card_id");
          }
          state.dashcardData[newDashCardId] = {
            [sourceDashCard.card_id]:
              state.dashcardData[sourceDashCard.id][sourceDashCard.card_id],
          };
        });

        // 3. Select new tab
        state.selectedTabId = newTabId;
        return;
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
          throw new Error(
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
        prevDash.dashcards.forEach(id => {
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
        throw new Error(
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
        throw new Error(
          `RENAME_TAB was dispatched but tabToRenameIndex (${tabToRenameIndex}) is invalid`,
        );
      }

      prevTabs[tabToRenameIndex].name = name;
    });

    builder.addCase(
      moveTab,
      (state, { payload: { sourceTabId, destinationTabId } }) => {
        const { prevDash, prevTabs } = getPrevDashAndTabs({ state });
        const sourceTabIndex = prevTabs.findIndex(
          ({ id }) => id === sourceTabId,
        );
        const destTabIndex = prevTabs.findIndex(
          ({ id }) => id === destinationTabId,
        );

        if (!prevDash || sourceTabIndex === -1 || destTabIndex === -1) {
          throw new Error(
            `MOVE_TAB was dispatched but either prevDash (${JSON.stringify(
              prevDash,
            )}), sourceTabIndex (${sourceTabIndex}) or destTabIndex (${destTabIndex}) is invalid`,
          );
        }

        prevDash.tabs = arrayMove(prevTabs, sourceTabIndex, destTabIndex);
      },
    );

    builder.addCase(selectTab, (state, { payload: { tabId } }) => {
      _selectTab({ state, tabId });
    });

    builder.addCase(
      _moveDashCardToTab,
      (state, { payload: { dashCardId, destinationTabId } }) => {
        const dashboardState = { ...state } as unknown as DashboardState;
        const dashCard = dashboardState.dashcards[dashCardId];
        const dashboardId = checkNotNull(dashboardState.dashboardId);
        const dashcards = dashboardState.dashcards;
        const dashboards = dashboardState.dashboards;

        const { row, col } = getPositionForNewDashCard(
          getExistingDashCards(
            dashboards,
            dashcards,
            dashboardId,
            destinationTabId,
          ),
          dashCard.size_x,
          dashCard.size_y,
        );
        dashCard.row = row;
        dashCard.col = col;

        dashCard.dashboard_tab_id = destinationTabId;
        dashCard.isDirty = true;
      },
    );

    builder.addCase(
      undoMoveDashCardToTab,
      (
        state,
        { payload: { dashCardId, originalCol, originalRow, originalTabId } },
      ) => {
        const dashCard = state.dashcards[dashCardId];

        dashCard.row = calculateDashCardRowAfterUndo(originalRow);
        dashCard.col = originalCol;
        dashCard.dashboard_tab_id = originalTabId;
        dashCard.isDirty = true;
      },
    );

    builder.addCase(Dashboards.actionTypes.UPDATE, (state, { payload }) => {
      const { dashcards: newDashcards, tabs: newTabs } = payload.dashboard;

      const { prevDash, prevTabs } = getPrevDashAndTabs({
        state,
        filterRemovedTabs: true,
      });

      if (!prevDash) {
        // If there's no previous version of the dashboard loaded we don't need to update
        // the IDs of dashcards and tabs. The app can't be in a state where the dashcards
        // and tabs have been updated.
        return;
      }

      // 1. Replace temporary with real dashcard ids
      const prevDashcardIds = prevDash.dashcards.filter(
        id => !state.dashcards[id].isRemoved,
      );

      prevDashcardIds.forEach((prevId, index) => {
        const prevDashcardData = state.dashcardData[prevId];

        if (prevDashcardData) {
          state.dashcardData[newDashcards[index].id] = prevDashcardData;
        }
      });

      // 2. Re-select the currently selected tab with its real id
      const selectedTabIndex = prevTabs.findIndex(
        tab => tab.id === state.selectedTabId,
      );
      state.selectedTabId = (newTabs && newTabs[selectedTabIndex]?.id) ?? null;
    });

    builder.addCase(CANCEL_EDITING_DASHBOARD, state => {
      const { editingDashboard, selectedTabId } = state;
      const tabs = editingDashboard?.tabs ?? [];
      const hasTab = tabs.some(tab => tab.id === selectedTabId);
      if (!hasTab) {
        state.selectedTabId = tabs[0]?.id ?? null;
      }
    });

    builder.addCase<
      string,
      { type: string; payload?: { clearCache: boolean } }
    >(INITIALIZE, (state, { payload: { clearCache = true } = {} }) => {
      if (clearCache) {
        state.selectedTabId = INITIAL_DASHBOARD_STATE.selectedTabId;
        state.tabDeletions = INITIAL_DASHBOARD_STATE.tabDeletions;
      }
    });

    builder.addCase(initTabs, (state, { payload: { slug } }) => {
      const { prevTabs } = getPrevDashAndTabs({ state });

      const idFromSlug = getIdFromSlug(slug);
      const tabId =
        idFromSlug && prevTabs.map(t => t.id).includes(idFromSlug)
          ? idFromSlug
          : prevTabs[0]?.id ?? null;

      state.selectedTabId = tabId;
    });
  },
);
