import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import { Box, Button, Icon } from "metabase/ui";
import type { TimeseriesXAxis } from "metabase/viz-core";
import type {
  CollectionId,
  Timeline,
  TimelineEvent,
  TimelineEventId,
} from "metabase-types/api";

import TimelinePanel from "../../containers/TimelinePanel";
import { getFocusedTimelines, getTimelineSidebarTitle } from "../../utils";
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
  onShowTimelineEvents: (events: TimelineEvent[]) => void;
  onHideTimelineEvents: (events: TimelineEvent[]) => void;
  onShowTimeline: (timeline: Timeline) => void;
  onHideTimeline: (timeline: Timeline) => void;
  onSelectEvents?: (events: TimelineEvent[]) => void;
  onDeselectEvents?: () => void;
  onEventCreated?: (event: TimelineEvent) => void;
  onShowAllEvents?: () => void;
  onClose?: () => void;
}

export const TimelineSidebar = ({
  collectionId,
  timelines,
  visibleEventIds,
  partiallyVisibleEventIds,
  selectedEventIds,
  focusedEventIds = null,
  xAxis,
  onShowTimelineEvents,
  onHideTimelineEvents,
  onShowTimeline,
  onHideTimeline,
  onSelectEvents,
  onDeselectEvents,
  onEventCreated,
  onShowAllEvents,
  onClose,
}: TimelineSidebarProps) => {
  const [modal, setModal] = useState<TimelineEventModalState | null>(null);
  const isFocused = focusedEventIds != null;

  const displayedTimelines = useMemo(
    () => getFocusedTimelines(timelines, focusedEventIds),
    [timelines, focusedEventIds],
  );

  const title = getTimelineSidebarTitle({
    focusedTimelines: displayedTimelines,
    isFocused,
    xAxis,
  });

  const handleToggleEventSelected = useCallback(
    (event: TimelineEvent, isSelected: boolean) => {
      if (isSelected) {
        onSelectEvents?.([event]);
      } else {
        onDeselectEvents?.();
      }
    },
    [onSelectEvents, onDeselectEvents],
  );

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
          onNewEvent={() => setModal({ type: "new" })}
          onEditEvent={(event) => setModal({ type: "edit", eventId: event.id })}
          onMoveEvent={(event) => setModal({ type: "move", eventId: event.id })}
          onShowTimelineEvents={onShowTimelineEvents}
          onHideTimelineEvents={onHideTimelineEvents}
          onShowTimeline={onShowTimeline}
          onHideTimeline={onHideTimeline}
          onToggleEventSelected={handleToggleEventSelected}
        />
      </SidebarContent>
      <TimelineEventModals
        modal={modal}
        collectionId={collectionId}
        onEventCreated={onEventCreated}
        onClose={() => setModal(null)}
      />
    </>
  );
};
