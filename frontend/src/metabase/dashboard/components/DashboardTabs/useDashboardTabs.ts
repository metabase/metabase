import { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

import { Dispatch, State } from "metabase-types/store";
import {
  addCardsToTab,
  addTabToDash,
  removeTabFromDash,
  selectTab as selectTabAction,
} from "metabase/dashboard/actions";
import { DashboardTabId } from "metabase-types/api";

export function useDashboardTabs() {
  const dispatch = useDispatch<Dispatch>();
  const dashboardId = useSelector(
    // todo fix 0 null check
    (state: State) => state.dashboard.dashboardId ?? 0,
  );
  const dashboard = useSelector(
    (state: State) => state.dashboard.dashboards[dashboardId],
  );
  const selectedTabId = useSelector(
    // todo fix 0 null check
    (state: State) => state.dashboard.selectedTabId,
  );
  const [tempId, setTempId] = useState(-1);

  const tabs = useMemo(() => dashboard.ordered_tabs ?? [], [dashboard]);
  const cardIds = dashboard.ordered_cards;

  // todo consider splitting this out into it's own hook for naming?
  useEffect(() => {
    if (selectedTabId === null && tabs.length > 0) {
      dispatch(
        // todo fix 0 null check
        selectTabAction({ tabId: tabs.find(t => t.position === 0)?.id ?? 0 }),
      );
    }
  }, [dispatch, selectedTabId, tabs]);

  const createNewTab = () => {
    if (tabs.length === 0) {
      dispatch(addCardsToTab({ cardIds, tabId: tempId }));
    }
    dispatch(
      addTabToDash({
        tab: {
          id: tempId,
          dashboard_id: dashboardId,
          name: `Page ${tabs.length + 1}`,
          position:
            tabs.length > 0 ? Math.max(...tabs.map(t => t.position)) + 1 : 0,
          entity_id: "",
          created_at: "",
          updated_at: "",
        },
      }),
    );
    setTempId(t => t - 1);
  };

  const deleteTab = (tabId: DashboardTabId) => {
    const tabToRemove = tabs.find(({ id }) => id === tabId);
    if (!tabToRemove) {
      return;
    }

    dispatch(
      selectTabAction({
        tabId:
          tabs.find(({ position }) => position === tabToRemove.position - 1)
            ?.id ?? null,
      }),
    );
    dispatch(removeTabFromDash(tabId));
    // TODO either make an UPDATE_TABS action or ask ngoc if we can get rid of position entirely
    tabs.forEach(tab => {
      if (tab.position > tabToRemove.position) {
        dispatch(removeTabFromDash(tab.id));
        dispatch(addTabToDash({ tab: { ...tab, position: tab.position - 1 } }));
      }
    });
  };

  const selectTab = (tabId: DashboardTabId) =>
    dispatch(selectTabAction({ tabId }));

  return { tabs, selectedTabId, createNewTab, deleteTab, selectTab };
}
