import { useDashboardContext } from "metabase/dashboard/context";
import type { EventsSidebarProps } from "metabase/redux/store";

import { DashCardEventsSidebar } from "./DashCardEventsSidebar";
import { DashboardWideEventsSidebar } from "./DashboardWideEventsSidebar";

export function DashboardEventsSidebar() {
  const { sidebar } = useDashboardContext();
  const { dashcardId, focusedEventIds }: EventsSidebarProps = sidebar.props;
  return dashcardId != null ? (
    <DashCardEventsSidebar
      dashcardId={dashcardId}
      focusedEventIds={focusedEventIds}
    />
  ) : (
    <DashboardWideEventsSidebar />
  );
}
