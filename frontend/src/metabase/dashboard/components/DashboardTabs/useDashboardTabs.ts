import { useMount } from "react-use";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  createNewTab as createNewTabAction,
  renameTab as renameTabAction,
  deleteTab as deleteTabAction,
  initTabs,
  selectTab as selectTabAction,
} from "metabase/dashboard/actions";
import { SelectedTabId } from "metabase-types/store";

export function useDashboardTabs() {
  const dispatch = useDispatch();
  const dashboardId = useSelector(state => state.dashboard.dashboardId);
  const tabs = useSelector(state =>
    dashboardId
      ? state.dashboard.dashboards[dashboardId].ordered_tabs ?? []
      : [],
  );
  const selectedTabId = useSelector(state => state.dashboard.selectedTabId);

  useMount(() => dispatch(initTabs()));

  const createNewTab = () => dispatch(createNewTabAction());

  const deleteTab = (tabId: SelectedTabId) =>
    dispatch(deleteTabAction({ tabId }));

  const renameTab = (tabId: SelectedTabId, name: string) =>
    dispatch(renameTabAction({ tabId, name }));

  const selectTab = (tabId: SelectedTabId) =>
    dispatch(selectTabAction({ tabId }));

  // TODO define the functions here?
  return { tabs, selectedTabId, createNewTab, deleteTab, renameTab, selectTab };
}
