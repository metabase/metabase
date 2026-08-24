import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { openEventsSidebar } from "metabase/dashboard/actions";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { useDispatch } from "metabase/redux";

export const EventsButton = () => {
  const { sidebar, closeSidebar } = useDashboardContext();
  const dispatch = useDispatch();
  const isEventsSidebarOpen = sidebar.name === SIDEBAR_NAME.events;
  const isDashboardWideOpen =
    isEventsSidebarOpen && sidebar.props.dashcardId == null;

  return (
    <ToolbarButton
      tooltipLabel={t`Events`}
      icon="calendar"
      isActive={isEventsSidebarOpen}
      onClick={() =>
        isDashboardWideOpen ? closeSidebar() : dispatch(openEventsSidebar())
      }
      aria-label={t`Events`}
    />
  );
};
