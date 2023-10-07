import type { DashCardId, DashboardTabId } from "metabase-types/api";
import { moveDashCardToTab } from "metabase/dashboard/actions";
import {
  getLastSelectedTabId,
  getSelectedTabId,
  getTabs,
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

export function useDashCardTabMenu(dashCardId: DashCardId) {
  const dispatch = useDispatch();
  const tabs = useSelector(getTabs);
  const selectedTabId = useSelector(getSelectedTabId);
  const lastSelectedTabId = useSelector(getLastSelectedTabId);

  return {
    showMenu: tabs.length > 1,
    /* TODO recency logic
    Tab with `lastSelectedTabId` (if non-null) should be first
    Then all other tabs in order
    Except the currently selected tab
    */
    tabs: tabs.map(t => ({ name: t.name, id: t.id })),
    moveToTab: (destTabId: DashboardTabId) =>
      dispatch(moveDashCardToTab({ dashCardId, destTabId })),
  };
}
