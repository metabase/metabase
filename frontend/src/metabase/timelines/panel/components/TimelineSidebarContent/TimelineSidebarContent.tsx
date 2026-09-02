import type { ComponentProps } from "react";
import { useCallback } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import { Box, Button, Icon } from "metabase/ui";
import type { TimelineEvent } from "metabase-types/api";

import TimelinePanel from "../../containers/TimelinePanel";

type TimelinePanelProps = ComponentProps<typeof TimelinePanel>;

export interface TimelineSidebarContentProps extends Omit<
  TimelinePanelProps,
  "onToggleEventSelected"
> {
  title: string;
  onShowAllEvents?: () => void;
  onSelectEvents?: (events: TimelineEvent[]) => void;
  onDeselectEvents?: () => void;
  onClose?: () => void;
}

export function TimelineSidebarContent({
  title,
  onShowAllEvents,
  onSelectEvents,
  onDeselectEvents,
  onClose,
  timelines,
  collectionId,
  visibleEventIds,
  partiallyVisibleEventIds,
  selectedEventIds,
  onNewEvent,
  onEditEvent,
  onMoveEvent,
  onArchiveEvent,
  onShowTimelineEvents,
  onHideTimelineEvents,
  onShowTimeline,
  onHideTimeline,
}: TimelineSidebarContentProps) {
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
    <SidebarContent title={title} onClose={onClose}>
      {onShowAllEvents && (
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
        timelines={timelines}
        collectionId={collectionId}
        visibleEventIds={visibleEventIds}
        partiallyVisibleEventIds={partiallyVisibleEventIds}
        selectedEventIds={selectedEventIds}
        onNewEvent={onNewEvent}
        onEditEvent={onEditEvent}
        onMoveEvent={onMoveEvent}
        onArchiveEvent={onArchiveEvent}
        onShowTimelineEvents={onShowTimelineEvents}
        onHideTimelineEvents={onHideTimelineEvents}
        onShowTimeline={onShowTimeline}
        onHideTimeline={onHideTimeline}
        onToggleEventSelected={handleToggleEventSelected}
      />
    </SidebarContent>
  );
}
