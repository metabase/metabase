import { useMount } from "react-use";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  createNewTab as createNewTabAction,
  renameTab as renameTabAction,
  deleteTab as deleteTabAction,
  initTabs,
  selectTab as selectTabAction,
} from "metabase/dashboard/actions";
import { SelectedTabId, State } from "metabase-types/store";
import { getDashboardId } from "metabase/dashboard/selectors";

export function getSelectedTabId(state: State) {
  return state.dashboard.selectedTabId;
}

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

  return {
    tabs,
    selectedTabId,
    createNewTab: () => dispatch(createNewTabAction()),
    deleteTab: (tabId: SelectedTabId) => dispatch(deleteTabAction(tabId)),
    renameTab: (tabId: SelectedTabId, name: string) =>
      dispatch(renameTabAction({ tabId, name })),
    selectTab: (tabId: SelectedTabId) => dispatch(selectTabAction({ tabId })),
  };
}
