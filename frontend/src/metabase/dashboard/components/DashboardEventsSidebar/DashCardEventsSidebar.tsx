import { useCallback, useEffect, useMemo } from "react";

import { Sidebar } from "metabase/common/components/Sidebar";
import { openEventsSidebar } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import { getDashCardById } from "metabase/dashboard/selectors";
import {
  getDashCardSelectedTimelineEventIds,
  getDashCardTimeseriesXAxis,
  getDashCardVisibleTimelineEvents,
} from "metabase/dashboard/timeline-events";
import { useDispatch, useSelector } from "metabase/redux";
import { getTransformedTimelines } from "metabase/timelines/panel/selectors";
import type { DashCardId, TimelineEventId } from "metabase-types/api";

import { EventsPanel } from "./EventsPanel";

export function DashCardEventsSidebar({
  dashcardId,
  focusedEventIds,
}: {
  dashcardId: DashCardId;
  focusedEventIds?: TimelineEventId[];
}) {
  const dispatch = useDispatch();
  const { selectedTabId, closeSidebar } = useDashboardContext();
  const dashcard = useSelector((state) => getDashCardById(state, dashcardId));
  const timelines = useSelector(getTransformedTimelines);
  const visibleEvents = useSelector((state) =>
    getDashCardVisibleTimelineEvents(state, dashcardId),
  );
  const selectedEventIds = useSelector((state) =>
    getDashCardSelectedTimelineEventIds(state, dashcardId),
  );
  const xAxis = useSelector((state) =>
    getDashCardTimeseriesXAxis(state, dashcardId),
  );

  const isOnAnotherTab =
    dashcard == null ||
    dashcard.isRemoved ||
    (selectedTabId != null && dashcard.dashboard_tab_id !== selectedTabId);
  useEffect(() => {
    if (isOnAnotherTab) {
      closeSidebar();
    }
  }, [isOnAnotherTab, closeSidebar]);

  const visibleEventIds = useMemo(
    () => visibleEvents.map((event) => event.id),
    [visibleEvents],
  );
  const dashcardIds = useMemo(() => [dashcardId], [dashcardId]);

  const handleShowAllEvents = useCallback(() => {
    dispatch(openEventsSidebar({ dashcardId }));
  }, [dispatch, dashcardId]);

  if (!dashcard) {
    return null;
  }

  return (
    <Sidebar data-testid="dashboard-events-sidebar">
      <EventsPanel
        dashcardIds={dashcardIds}
        selectionDashcardId={dashcardId}
        timelines={timelines}
        visibleEventIds={visibleEventIds}
        selectedEventIds={selectedEventIds}
        focusedEventIds={focusedEventIds}
        xAxis={xAxis}
        onShowAllEvents={handleShowAllEvents}
      />
    </Sidebar>
  );
}
