import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context";
import type {
  DashboardSidebarState,
  EventsSidebarState,
} from "metabase/redux/store";

import { DashCardEventsSidebar } from "./DashCardEventsSidebar";
import { DashboardWideEventsSidebar } from "./DashboardWideEventsSidebar";

function isEventsSidebar(
  sidebar: DashboardSidebarState,
): sidebar is EventsSidebarState {
  return sidebar.name === SIDEBAR_NAME.events;
}

export function DashboardEventsSidebar() {
  const { sidebar } = useDashboardContext();
  if (!isEventsSidebar(sidebar)) {
    return null;
  }
  const { dashcardId, focusedEventIds } = sidebar.props;
  return dashcardId != null ? (
    <DashCardEventsSidebar
      dashcardId={dashcardId}
      focusedEventIds={focusedEventIds}
    />
  ) : (
    <DashboardWideEventsSidebar />
  );
}
