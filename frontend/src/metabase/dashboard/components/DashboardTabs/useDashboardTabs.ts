import { useMount } from "react-use";
import { t } from "ttag";
import type { UniqueIdentifier } from "@dnd-kit/core";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  createNewTab,
  renameTab,
  deleteTab as deleteTabAction,
  initTabs,
  selectTab,
  undoDeleteTab,
  moveTab as moveTabAction,
} from "metabase/dashboard/actions";
import { SelectedTabId } from "metabase-types/store";
import { getDashboardId, getSelectedTabId } from "metabase/dashboard/selectors";
import { addUndo } from "metabase/redux/undo";

let tabDeletionId = 1;

export function useDashboardTabs() {
  const dispatch = useDispatch();
  const dashboardId = useSelector(getDashboardId);
  const tabs = useSelector(state =>
    dashboardId
      ? state.dashboard.dashboards[dashboardId].ordered_tabs?.filter(
          tab => !tab.isRemoved,
        ) ?? []
      : [],
  );
  const selectedTabId = useSelector(getSelectedTabId);

  useMount(() => dispatch(initTabs()));

  const deleteTab = (tabId: SelectedTabId) => {
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
        destTabId: typeof overId === "number" ? overId : parseInt(overId),
      }),
    );

  return {
    tabs,
    selectedTabId,
    createNewTab: () => dispatch(createNewTab()),
    deleteTab,
    renameTab: (tabId: SelectedTabId, name: string) =>
      dispatch(renameTab({ tabId, name })),
    selectTab: (tabId: SelectedTabId) => dispatch(selectTab({ tabId })),
    moveTab,
  };
}
