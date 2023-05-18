import { useMount } from "react-use";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  createNewTab as createNewTabAction,
  renameTab as renameTabAction,
  deleteTab as deleteTabAction,
  initTabs,
  selectTab as selectTabAction,
  undoDeleteTab,
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

  return {
    tabs,
    selectedTabId,
    createNewTab: () => dispatch(createNewTabAction()),
    deleteTab: (tabId: SelectedTabId) => deleteTab(tabId),
    renameTab: (tabId: SelectedTabId, name: string) =>
      dispatch(renameTabAction({ tabId, name })),
    selectTab: (tabId: SelectedTabId) => dispatch(selectTabAction({ tabId })),
  };
}
