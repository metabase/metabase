import { useMount } from "react-use";
import { useDispatch, useSelector } from "react-redux";

import { Dispatch, State } from "metabase-types/store";
import {
  createNewTab as createNewTabAction,
  deleteTab as deleteTabAction,
  initTabs,
  selectTab as selectTabAction,
} from "metabase/dashboard/actions";
import { DashboardTabId } from "metabase-types/api";

export function useDashboardTabs() {
  const dispatch = useDispatch<Dispatch>();
  const dashboardId = useSelector(
    (state: State) => state.dashboard.dashboardId,
  );
  const tabs = useSelector((state: State) =>
    dashboardId
      ? state.dashboard.dashboards[dashboardId].ordered_tabs ?? []
      : [],
  );
  const selectedTabId = useSelector(
    (state: State) => state.dashboard.selectedTabId,
  );

  useMount(() => dispatch(initTabs()));

  const createNewTab = () => dispatch(createNewTabAction());

  const deleteTab = (tabId: DashboardTabId) =>
    dispatch(deleteTabAction({ tabId }));

  const selectTab = (tabId: DashboardTabId) =>
    dispatch(selectTabAction({ tabId }));

  return { tabs, selectedTabId, createNewTab, deleteTab, selectTab };
}
