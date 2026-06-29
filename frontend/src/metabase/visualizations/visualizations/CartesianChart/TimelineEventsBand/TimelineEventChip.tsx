import { t } from "ttag";

import { HoverCard, Icon, UnstyledButton } from "metabase/ui";
import { TIMELINE_EVENTS_BAND } from "metabase/visualizations/echarts/cartesian/constants/style";

import S from "./TimelineEventsBand.module.css";
import { TimelineEventRow, TimelineEventsList } from "./TimelineEventsList";
import type { PositionedTimelineEventGroup } from "./utils";

const MAX_VISIBLE_EVENTS = 3;

const AXIS_CLEARANCE = 8;
const POPOVER_OFFSET =
  TIMELINE_EVENTS_BAND.marginY +
  TIMELINE_EVENTS_BAND.bandPaddingY +
  AXIS_CLEARANCE;

interface TimelineEventChipProps {
  eventsGroup: PositionedTimelineEventGroup;
  centerY: number;
  onOpenTimelines?: () => void;
}

export const TimelineEventChip = ({
  eventsGroup,
  centerY,
  onOpenTimelines,
}: TimelineEventChipProps) => {
  const { group, x, iconName, count } = eventsGroup;
  const { events } = group;

  const isSingleEvent = events.length === 1;
  const hasMoreThanMax = events.length > MAX_VISIBLE_EVENTS;
  const visibleEvents = hasMoreThanMax
    ? events.slice(0, MAX_VISIBLE_EVENTS)
    : events;
  const showSeeAll = hasMoreThanMax && onOpenTimelines != null;

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
          className={S.chip}
          style={{ left: x, top: centerY }}
          data-testid="timeline-event-chip"
          aria-label={getChipLabel(eventsGroup)}
        >
          {count > 1 ? (
            <span className={S.count}>{count}</span>
          ) : (
            <Icon name={iconName} size={12} />
          )}
        </UnstyledButton>
      </HoverCard.Target>
      <HoverCard.Dropdown p={0} bdrs="lg">
        <div data-testid="timeline-event-popover">
          {isSingleEvent ? (
            <div className={S.singleEvent}>
              <TimelineEventRow event={events[0]} showIcon={false} />
            </div>
          ) : (
            <>
              <div className={S.eventList}>
                <TimelineEventsList events={visibleEvents} />
              </div>
              {showSeeAll && (
                <UnstyledButton className={S.seeAll} onClick={onOpenTimelines}>
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

const getChipLabel = ({ group, count }: PositionedTimelineEventGroup) =>
  count > 1 ? t`${count} events` : group.events[0].name;
