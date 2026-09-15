import { useDashboardContext } from "metabase/dashboard/context";
import { getEventsSidebarProps } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/redux";

import { DashCardEventsSidebar } from "./DashCardEventsSidebar";
import { DashboardWideEventsSidebar } from "./DashboardWideEventsSidebar";

export function DashboardEventsSidebar() {
  const { withTimelineEvents } = useDashboardContext();
  const sidebarProps = useSelector(getEventsSidebarProps);
  if (!withTimelineEvents || !sidebarProps) {
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
