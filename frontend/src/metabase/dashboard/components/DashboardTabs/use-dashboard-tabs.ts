import type { UniqueIdentifier } from "@dnd-kit/core";
import { t } from "ttag";

import { trackTabDuplicated } from "metabase/dashboard/analytics";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import type { SelectedTabId } from "metabase-types/store";

let tabDeletionId = 1;

function isTabIdType(id: unknown): id is SelectedTabId {
  return typeof id === "number" || id === null;
}

export function useDashboardTabs() {
  const {
    dashboardId,
    tabs,
    selectedTabId,
    duplicateTab: duplicateTabAction,
    deleteTab: deleteTabAction,
    undoDeleteTab,
    moveTab: moveTabAction,
    selectTab,
    renameTab,
    createNewTab,
  } = useDashboardContext();

  const dispatch = useDispatch();

  const duplicateTab = (tabId: UniqueIdentifier | null) => {
    if (!isTabIdType(tabId)) {
      throw Error("duplicateTab was called but tab id is invalid");
    }

    duplicateTabAction(tabId);
    if (dashboardId) {
      trackTabDuplicated(dashboardId);
    }
  };

  const deleteTab = (tabId: UniqueIdentifier | null) => {
    if (!isTabIdType(tabId)) {
      throw Error("deleteTab was called but tab id is invalid");
    }

    const tabName = tabs.find(({ id }) => id === tabId)?.name;
    if (!tabName) {
      throw Error(`deleteTab was called but no tab with id ${tabId} was found`);
    }
    const id = tabDeletionId++;

    deleteTabAction({ tabId, tabDeletionId: id });
    dispatch(
      addUndo({
        message: t`Deleted "${tabName}"`,
        undo: true,
        action: () => undoDeleteTab({ tabDeletionId: id }),
      }),
    );
  };

  const moveTab = (activeId: UniqueIdentifier, overId: UniqueIdentifier) =>
    moveTabAction({
      sourceTabId: typeof activeId === "number" ? activeId : parseInt(activeId),
      destinationTabId: typeof overId === "number" ? overId : parseInt(overId),
    });

  return {
    tabs,
    selectedTabId,
    createNewTab,
    duplicateTab,
    deleteTab,
    renameTab: (tabId: SelectedTabId, name: string) =>
      renameTab({ tabId, name }),
    selectTab: (tabId: SelectedTabId) => selectTab({ tabId }),
    moveTab,
  };
}
