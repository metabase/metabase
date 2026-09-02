import { getEventsSidebarProps } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/redux";

import { DashCardEventsSidebar } from "./DashCardEventsSidebar";
import { DashboardWideEventsSidebar } from "./DashboardWideEventsSidebar";

export function DashboardEventsSidebar() {
  const sidebarProps = useSelector(getEventsSidebarProps);
  if (!sidebarProps) {
    return null;
  }
  const { dashcardId, focusedEventIds } = sidebarProps;
  return dashcardId != null ? (
    <DashCardEventsSidebar
      dashcardId={dashcardId}
      focusedEventIds={focusedEventIds}
    />
  ) : (
    <DashboardWideEventsSidebar />
  );
}
