import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context/context";

export const EventsButton = () => {
  const { toggleSidebar, sidebar } = useDashboardContext();

  return (
    <ToolbarButton
      tooltipLabel={t`Events`}
      icon="calendar"
      isActive={sidebar.name === SIDEBAR_NAME.events}
      onClick={() => toggleSidebar(SIDEBAR_NAME.events)}
      aria-label={t`Events`}
    />
  );
};
