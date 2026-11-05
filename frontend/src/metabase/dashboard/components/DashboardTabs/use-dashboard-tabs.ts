import type { UniqueIdentifier } from "@dnd-kit/core";

import { trackTabDuplicated } from "metabase/dashboard/analytics";
import { useDashboardContext } from "metabase/dashboard/context";
import type { SelectedTabId } from "metabase/redux/store";

function isTabIdType(id: unknown): id is SelectedTabId {
  return typeof id === "number" || id === null;
}

export function useDashboardTabs() {
  const {
    dashboardId,
    tabs,
    selectedTabId,
    duplicateTab: duplicateTabAction,
    deleteTab: deleteTabById,
    moveTab: moveTabAction,
    selectTab,
    renameTab,
    createNewTab,
  } = useDashboardContext();

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

    deleteTabById(tabId);
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
