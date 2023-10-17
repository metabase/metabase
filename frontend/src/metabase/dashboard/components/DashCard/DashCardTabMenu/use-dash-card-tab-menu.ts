import { useMemo } from "react";
import type { DashCardId, DashboardTabId } from "metabase-types/api";
import { moveDashCardToTab } from "metabase/dashboard/actions";
import { getSelectedTabId, getTabs } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

export function useDashCardTabMenu(dashCardId: DashCardId) {
  const dispatch = useDispatch();
  const tabs = useSelector(getTabs);
  const selectedTabId = useSelector(getSelectedTabId);

  const tabsToShow = useMemo(() => {
    return tabs.filter(t => t.id !== selectedTabId);
  }, [selectedTabId, tabs]);

  return {
    showMenu: tabs.length > 1,
    tabs: tabsToShow,
    moveToTab: (destTabId: DashboardTabId) =>
      dispatch(moveDashCardToTab({ dashCardId, destTabId })),
  };
}
