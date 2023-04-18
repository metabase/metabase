import { useMount } from "react-use";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  createNewTab as createNewTabAction,
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

  const selectTab = (tabId: SelectedTabId) =>
    dispatch(selectTabAction({ tabId }));

  return { tabs, selectedTabId, createNewTab, deleteTab, selectTab };
}
