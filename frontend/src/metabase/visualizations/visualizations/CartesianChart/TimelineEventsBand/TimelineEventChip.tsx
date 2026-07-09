import cx from "classnames";
import { t } from "ttag";

import { Box, HoverCard, Icon, Text, UnstyledButton } from "metabase/ui";
import { TIMELINE_EVENTS_BAND } from "metabase/visualizations/echarts/cartesian/constants/style";
import type { TimelineEvent, TimelineEventId } from "metabase-types/api";

import S from "./TimelineEventsBand.module.css";
import { TimelineEventRow, TimelineEventsList } from "./TimelineEventsList";
import {
  type PositionedTimelineEventGroup,
  getTimelineEventGroupIconName,
} from "./utils";

const MAX_VISIBLE_EVENTS = 3;

const AXIS_CLEARANCE = 8;
const POPOVER_OFFSET =
  TIMELINE_EVENTS_BAND.marginY +
  TIMELINE_EVENTS_BAND.bandPaddingY +
  AXIS_CLEARANCE;

interface TimelineEventChipProps {
  eventsGroup: PositionedTimelineEventGroup;
  centerY: number;
  selectedEventIds: TimelineEventId[];
  onOpenTimelines?: (eventIds?: number[]) => void;
  onSelectTimelineEvents?: (events: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
}

export const TimelineEventChip = ({
  eventsGroup,
  centerY,
  selectedEventIds,
  onOpenTimelines,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
}: TimelineEventChipProps) => {
  const { group, x } = eventsGroup;
  const { events } = group;

  const isSingleEvent = events.length === 1;
  const hasMoreThanMax = events.length > MAX_VISIBLE_EVENTS;
  const visibleEvents = hasMoreThanMax
    ? events.slice(0, MAX_VISIBLE_EVENTS)
    : events;

  const isSelected = events.some((event) =>
    selectedEventIds.includes(event.id),
  );
  const areAllEventsSelected = events.every((event) =>
    selectedEventIds.includes(event.id),
  );

  const canSelect = onSelectTimelineEvents != null;
  const handleSelect = () => {
    onOpenTimelines?.(isSingleEvent ? undefined : events.map((e) => e.id));
    onSelectTimelineEvents?.(events);
  };

  const handleChipClick = () => {
    if (areAllEventsSelected) {
      onDeselectTimelineEvents?.();
      onOpenTimelines?.();
    } else {
      handleSelect();
    }
  };

  const showSeeAll = hasMoreThanMax && canSelect;

  return (
    <HoverCard
      position="top"
      offset={POPOVER_OFFSET}
      openDelay={50}
      closeDelay={150}
      shadow="md"
      classNames={{ dropdown: S.bridgeDropdown }}
    >
      <HoverCard.Target>
        <UnstyledButton
          className={cx(S.chip, isSelected && S.chipSelected)}
          style={{ left: x, top: centerY }}
          data-testid="timeline-event-chip"
          data-selected={isSelected}
          aria-label={
            isSingleEvent ? events[0].name : t`${events.length} events`
          }
          onClick={canSelect ? handleChipClick : undefined}
        >
          {isSingleEvent ? (
            <Icon name={getTimelineEventGroupIconName(group)} size={12} />
          ) : (
            <Text component="span" size="xs" fw="bold" lh={1}>
              {events.length}
            </Text>
          )}
        </UnstyledButton>
      </HoverCard.Target>
      <HoverCard.Dropdown p={0} bdrs="0.75rem">
        <div data-testid="timeline-event-popover">
          {isSingleEvent ? (
            <Box miw="8rem" maw="16rem" p="0.75rem">
              <TimelineEventRow event={events[0]} showIcon={false} />
            </Box>
          ) : (
            <>
              <Box w="16rem">
                <TimelineEventsList events={visibleEvents} />
              </Box>
              {showSeeAll && (
                <UnstyledButton
                  className={S.seeAllButton}
                  onClick={handleSelect}
                >
                  {t`See all`}
                </UnstyledButton>
              )}
            </>
          )}
        </div>
      </HoverCard.Dropdown>
    </HoverCard>
  );
};
