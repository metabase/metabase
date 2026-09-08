import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import { Box, Button, Icon } from "metabase/ui";
import {
  hideTimelineEvents,
  hideTimelines,
  showCreatedTimelineEvent,
  showTimelineEvents,
  showTimelines,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type { TimelineEventsVisibilityUpdate } from "metabase/visualizations/types";
import type { TimeseriesXAxis } from "metabase/viz-core";
import type {
  CollectionId,
  Timeline,
  TimelineEvent,
  TimelineEventId,
} from "metabase-types/api";

import TimelinePanel from "../../containers/TimelinePanel";
import {
  filterTimelinesByXAxis,
  getFocusedTimelines,
  getTimelineSidebarTitle,
} from "../../utils";
import {
  type TimelineEventModalState,
  TimelineEventModals,
} from "../TimelineEventModals";

export interface TimelineSidebarProps {
  collectionId: CollectionId | null | undefined;
  timelines: Timeline[];
  visibleEventIds: TimelineEventId[];
  partiallyVisibleEventIds?: TimelineEventId[];
  selectedEventIds: TimelineEventId[];
  focusedEventIds?: TimelineEventId[] | null;
  xAxis?: TimeseriesXAxis | null;
  onUpdateVisibility: (update: TimelineEventsVisibilityUpdate) => void;
  onSelectEvents: (events: TimelineEvent[]) => void;
  onDeselectEvents: () => void;
  onShowAllEvents?: () => void;
  onClose: () => void;
}

export const TimelineSidebar = ({
  collectionId,
  timelines,
  visibleEventIds,
  partiallyVisibleEventIds,
  selectedEventIds,
  focusedEventIds = null,
  xAxis = null,
  onUpdateVisibility,
  onSelectEvents,
  onDeselectEvents,
  onShowAllEvents,
  onClose,
}: TimelineSidebarProps) => {
  const [modal, setModal] = useState<TimelineEventModalState | null>(null);
  const isFocused = focusedEventIds != null;

  const displayedTimelines = useMemo(
    () =>
      getFocusedTimelines(
        filterTimelinesByXAxis(timelines, xAxis),
        focusedEventIds,
      ),
    [timelines, xAxis, focusedEventIds],
  );

  const title = getTimelineSidebarTitle({
    focusedTimelines: displayedTimelines,
    isFocused,
    xAxis,
  });

  const handleShowTimelineEvents = useCallback(
    (events: TimelineEvent[]) =>
      onUpdateVisibility((visibility, allTimelines) =>
        showTimelineEvents(visibility, events, allTimelines),
      ),
    [onUpdateVisibility],
  );

  const handleHideTimelineEvents = useCallback(
    (events: TimelineEvent[]) =>
      onUpdateVisibility((visibility, allTimelines) =>
        hideTimelineEvents(visibility, events, allTimelines),
      ),
    [onUpdateVisibility],
  );

  const handleShowTimeline = useCallback(
    (timeline: Timeline) =>
      onUpdateVisibility((visibility, allTimelines) =>
        showTimelines(visibility, [timeline.id], allTimelines),
      ),
    [onUpdateVisibility],
  );

  const handleHideTimeline = useCallback(
    (timeline: Timeline) =>
      onUpdateVisibility((visibility, allTimelines) =>
        hideTimelines(visibility, [timeline.id], allTimelines),
      ),
    [onUpdateVisibility],
  );

  const handleEventCreated = useCallback(
    (event: TimelineEvent) =>
      onUpdateVisibility((visibility, allTimelines) =>
        showCreatedTimelineEvent(visibility, event, allTimelines),
      ),
    [onUpdateVisibility],
  );

  const handleToggleEventSelected = useCallback(
    (event: TimelineEvent, isSelected: boolean) =>
      isSelected ? onSelectEvents([event]) : onDeselectEvents(),
    [onSelectEvents, onDeselectEvents],
  );

  const handleNewEvent = useCallback(() => setModal({ type: "new" }), []);
  const handleEditEvent = useCallback(
    (event: TimelineEvent) => setModal({ type: "edit", eventId: event.id }),
    [],
  );
  const handleMoveEvent = useCallback(
    (event: TimelineEvent) => setModal({ type: "move", eventId: event.id }),
    [],
  );
  const handleCloseModal = useCallback(() => setModal(null), []);

  return (
    <>
      <SidebarContent title={title} onClose={onClose}>
        {isFocused && onShowAllEvents && (
          <Box mx="xl" mb="sm">
            <Button
              p={0}
              variant="subtle"
              leftSection={<Icon name="chevronleft" />}
              onClick={onShowAllEvents}
              data-testid="timeline-sidebar-show-all"
            >
              {t`All events`}
            </Button>
          </Box>
        )}
        <TimelinePanel
          timelines={displayedTimelines}
          collectionId={collectionId}
          visibleEventIds={visibleEventIds}
          partiallyVisibleEventIds={partiallyVisibleEventIds}
          selectedEventIds={selectedEventIds}
          onNewEvent={handleNewEvent}
          onEditEvent={handleEditEvent}
          onMoveEvent={handleMoveEvent}
          onShowTimelineEvents={handleShowTimelineEvents}
          onHideTimelineEvents={handleHideTimelineEvents}
          onShowTimeline={handleShowTimeline}
          onHideTimeline={handleHideTimeline}
          onToggleEventSelected={handleToggleEventSelected}
        />
      </SidebarContent>
      <TimelineEventModals
        modal={modal}
        collectionId={collectionId}
        onEventCreated={handleEventCreated}
        onClose={handleCloseModal}
      />
    </>
  );
};
