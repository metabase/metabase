import { t } from "ttag";

import { Sidebar } from "metabase/common/components/Sidebar";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { useDashboardContext } from "metabase/dashboard/context";
import {
  getDashCardSelectedTimelineEventIds,
  getDashboardTimelineEventsAggregate,
  getTimelineEventsDashCardIds,
} from "metabase/dashboard/timeline-events";
import { useSelector } from "metabase/redux";
import { getTransformedTimelines } from "metabase/timelines/panel/selectors";
import { Box, Text } from "metabase/ui";

import { EventsPanel } from "./EventsPanel";

export function DashboardWideEventsSidebar() {
  const { closeSidebar } = useDashboardContext();
  const timelines = useSelector(getTransformedTimelines);
  const dashcardIds = useSelector(getTimelineEventsDashCardIds);
  const { visibleEventIds, partiallyVisibleEventIds } = useSelector(
    getDashboardTimelineEventsAggregate,
  );
  const selectedEventIds = useSelector((state) =>
    getDashCardSelectedTimelineEventIds(state),
  );

  return (
    <Sidebar data-testid="dashboard-events-sidebar">
      {dashcardIds.length === 0 ? (
        <SidebarContent title={t`Events`} onClose={closeSidebar}>
          <Box mx="lg" data-testid="dashboard-events-empty-state">
            <Text fw="bold">{t`Events can be displayed on time series charts`}</Text>
            <Text c="text-secondary" mt="xs">
              {t`Add some time series charts to this dashboard first`}
            </Text>
          </Box>
        </SidebarContent>
      ) : (
        <EventsPanel
          title={t`Events`}
          dashcardIds={dashcardIds}
          timelines={timelines}
          visibleEventIds={visibleEventIds}
          partiallyVisibleEventIds={partiallyVisibleEventIds}
          selectedEventIds={selectedEventIds}
        />
      )}
    </Sidebar>
  );
}
