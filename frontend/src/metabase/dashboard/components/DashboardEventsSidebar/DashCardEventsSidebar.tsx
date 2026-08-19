import { useCallback, useEffect, useMemo } from "react";

import { Sidebar } from "metabase/common/components/Sidebar";
import { openEventsSidebar } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import { getDashCardById, getDashcardData } from "metabase/dashboard/selectors";
import {
  getDashCardSelectedTimelineEventIds,
  getDashCardTimeseriesXAxis,
  getDashCardVisibleTimelineEvents,
} from "metabase/dashboard/timeline-events";
import { useDispatch, useSelector } from "metabase/redux";
import { getTransformedTimelines } from "metabase/timelines/panel/selectors";
import {
  filterTimelinesByXAxis,
  getFocusedTimelines,
  getTimelineSidebarTitle,
} from "metabase/timelines/panel/utils";
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
  const dashcardData = useSelector((state) =>
    getDashcardData(state, dashcardId),
  );
  const timelines = useSelector(getTransformedTimelines);
  const visibleEvents = useSelector((state) =>
    getDashCardVisibleTimelineEvents(state, dashcardId),
  );
  const selectedEventIds = useSelector((state) =>
    getDashCardSelectedTimelineEventIds(state, dashcardId),
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

  const xAxis = useMemo(
    () =>
      dashcard ? getDashCardTimeseriesXAxis(dashcard, dashcardData) : null,
    [dashcard, dashcardData],
  );
  const displayedTimelines = useMemo(
    () =>
      getFocusedTimelines(
        filterTimelinesByXAxis(timelines, xAxis),
        focusedEventIds ?? null,
      ),
    [timelines, xAxis, focusedEventIds],
  );
  const visibleEventIds = useMemo(
    () => visibleEvents.map((event) => event.id),
    [visibleEvents],
  );
  const dashcardIds = useMemo(() => [dashcardId], [dashcardId]);

  const isFocused = focusedEventIds != null;
  const handleShowAllEvents = useCallback(() => {
    dispatch(openEventsSidebar({ dashcardId }));
  }, [dispatch, dashcardId]);

  if (!dashcard) {
    return null;
  }

  return (
    <Sidebar data-testid="dashboard-events-sidebar">
      <EventsPanel
        title={getTimelineSidebarTitle({
          focusedTimelines: displayedTimelines,
          isFocused,
          xAxis,
        })}
        onShowAllEvents={isFocused ? handleShowAllEvents : undefined}
        dashcardIds={dashcardIds}
        selectionDashcardId={dashcardId}
        timelines={displayedTimelines}
        visibleEventIds={visibleEventIds}
        selectedEventIds={selectedEventIds}
      />
    </Sidebar>
  );
}
