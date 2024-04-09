import type { UniqueIdentifier } from "@dnd-kit/core";
import type { Location } from "history";
import { useMount } from "react-use";
import { t } from "ttag";

import {
  createNewTab,
  renameTab,
  deleteTab as deleteTabAction,
  initTabs,
  selectTab,
  undoDeleteTab,
  moveTab as moveTabAction,
  duplicateTab as duplicateTabAction,
} from "metabase/dashboard/actions";
import { trackTabDuplicated } from "metabase/dashboard/analytics";
import { getSelectedTabId, getTabs } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import type { DashboardId } from "metabase-types/api";
import type { SelectedTabId } from "metabase-types/store";

import { parseSlug, useSyncURLSlug } from "./use-sync-url-slug";

let tabDeletionId = 1;

function isTabIdType(id: unknown): id is SelectedTabId {
  return typeof id === "number" || id === null;
}

export function useDashboardTabs({
  location,
  dashboardId,
}: {
  location: Location;
  dashboardId: DashboardId;
}) {
  const dispatch = useDispatch();
  const tabs = useSelector(getTabs);
  const selectedTabId = useSelector(getSelectedTabId);

  useSyncURLSlug({ location });
  useMount(() => dispatch(initTabs({ slug: parseSlug({ location }) })));

  const duplicateTab = (tabId: UniqueIdentifier | null) => {
    if (!isTabIdType(tabId)) {
      throw Error("duplicateTab was called but tab id is invalid");
    }

    dispatch(duplicateTabAction(tabId));
    trackTabDuplicated(dashboardId);
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

    dispatch(deleteTabAction({ tabId, tabDeletionId: id }));
    dispatch(
      addUndo({
        message: t`Deleted "${tabName}"`,
        undo: true,
        action: () => dispatch(undoDeleteTab({ tabDeletionId: id })),
      }),
    );
  };

  const moveTab = (activeId: UniqueIdentifier, overId: UniqueIdentifier) =>
    dispatch(
      moveTabAction({
        sourceTabId:
          typeof activeId === "number" ? activeId : parseInt(activeId),
        destinationTabId:
          typeof overId === "number" ? overId : parseInt(overId),
      }),
    );

  return {
    tabs,
    selectedTabId,
    createNewTab: () => dispatch(createNewTab()),
    duplicateTab,
    deleteTab,
    renameTab: (tabId: SelectedTabId, name: string) =>
      dispatch(renameTab({ tabId, name })),
    selectTab: (tabId: SelectedTabId) => dispatch(selectTab({ tabId })),
    moveTab,
  };
}
