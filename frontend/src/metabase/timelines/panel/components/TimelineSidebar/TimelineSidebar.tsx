import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { Box, Button, Icon } from "metabase/ui";
import {
  hideTimelineEvents,
  showCreatedTimelineEvent,
  showTimelineEvents,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type {
  TimelineEventsVisibilityIntent,
  TimelineEventsVisibilityUpdate,
} from "metabase/visualizations/types";
import type { TimeseriesXAxis } from "metabase/viz-core";
import type {
  CollectionId,
  Timeline,
  TimelineEvent,
  TimelineEventId,
  TimelineEventSource,
} from "metabase-types/api";

import TimelinePanel from "../../containers/TimelinePanel";
import {
  filterTimelinesByXAxes,
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
  /** the axes of the charts this sidebar controls; events outside them are dropped */
  xAxes?: TimeseriesXAxis[] | null;
  isLoading?: boolean;
  error?: unknown;
  /** where events created from this sidebar are reported as coming from */
  eventSource?: TimelineEventSource;
  onUpdateVisibility: (
    update: TimelineEventsVisibilityUpdate,
    intent: TimelineEventsVisibilityIntent,
  ) => void;
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
  xAxes = null,
  isLoading = false,
  error,
  eventSource,
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
        filterTimelinesByXAxes(timelines, xAxes),
        focusedEventIds,
      ),
    [timelines, xAxes, focusedEventIds],
  );

  const title = getTimelineSidebarTitle({
    focusedTimelines: displayedTimelines,
    isFocused,
    xAxis: xAxes?.length === 1 ? xAxes[0] : null,
  });

  const handleShowTimelineEvents = useCallback(
    (events: TimelineEvent[]) =>
      onUpdateVisibility(
        (visibility, allTimelines) =>
          showTimelineEvents(visibility, events, allTimelines),
        "show",
      ),
    [onUpdateVisibility],
  );

  const handleHideTimelineEvents = useCallback(
    (events: TimelineEvent[]) =>
      onUpdateVisibility(
        (visibility, allTimelines) =>
          hideTimelineEvents(visibility, events, allTimelines),
        "hide",
      ),
    [onUpdateVisibility],
  );

  // the header checkbox reflects the events the card lists, so it acts on those
  const handleShowTimeline = useCallback(
    (timeline: Timeline) => handleShowTimelineEvents(timeline.events ?? []),
    [handleShowTimelineEvents],
  );

  const handleHideTimeline = useCallback(
    (timeline: Timeline) => handleHideTimelineEvents(timeline.events ?? []),
    [handleHideTimelineEvents],
  );

  const handleEventCreated = useCallback(
    (event: TimelineEvent) =>
      onUpdateVisibility(
        (visibility, allTimelines) =>
          showCreatedTimelineEvent(visibility, event, allTimelines),
        "create",
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
        {isLoading || error != null ? (
          <LoadingAndErrorWrapper loading={isLoading} error={error} />
        ) : (
          <>
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
          </>
        )}
      </SidebarContent>
      <TimelineEventModals
        modal={modal}
        collectionId={collectionId}
        source={eventSource}
        onEventCreated={handleEventCreated}
        onClose={handleCloseModal}
      />
    </>
  );
};
