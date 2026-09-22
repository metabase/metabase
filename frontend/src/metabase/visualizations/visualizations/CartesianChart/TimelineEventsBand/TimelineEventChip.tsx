import cx from "classnames";
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { TimelineEventInfo } from "metabase/common/components/TimelineEventInfo";
import { Box, Icon, Popover, Text, UnstyledButton } from "metabase/ui";
import {
  TIMELINE_EVENTS_BAND,
  type TimelineEventGroup,
} from "metabase/viz-core";
import type { TimelineEvent, TimelineEventId } from "metabase-types/api";

import S from "./TimelineEventsBand.module.css";
import { TimelineEventRow, TimelineEventsList } from "./TimelineEventsList";
import { getTimelineEventGroupIconName } from "./utils";

const MAX_VISIBLE_EVENTS = 3;

const AXIS_CLEARANCE = 8;
const POPOVER_OFFSET =
  TIMELINE_EVENTS_BAND.marginY +
  TIMELINE_EVENTS_BAND.bandPaddingY +
  AXIS_CLEARANCE;

export const POPOVER_CLOSE_DELAY_MS = 150;
const POPOVER_OPEN_DELAY_MS = 50;

interface TimelineEventChipProps {
  group: TimelineEventGroup;
  x: number;
  centerY: number;
  selectedEventIds: TimelineEventId[];
  hidden?: boolean;
  zIndex?: number;
  className?: string;
  onFocus?: () => void;
  onBlur?: (event: FocusEvent<HTMLButtonElement>) => void;
  onGroupHover?: (group: TimelineEventGroup | null) => void;
  onOpenTimelines?: (eventIds?: number[]) => void;
  onSelectTimelineEvents?: (events: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
  onSeeAllEvents?: (events: TimelineEvent[]) => void;
}

export const TimelineEventChip = ({
  group,
  x,
  centerY,
  selectedEventIds,
  hidden = false,
  zIndex,
  className,
  onFocus,
  onBlur,
  onGroupHover,
  onOpenTimelines,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
  onSeeAllEvents,
}: TimelineEventChipProps) => {
  const { events } = group;

  const [opened, setOpened] = useState(false);
  // a keyboard-opened popover traps focus so its contents are reachable; a
  // hover-opened one must not steal focus from wherever the user is typing
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const openedRef = useRef(opened);
  openedRef.current = opened;
  const hoverTimeoutRef = useRef<number>();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const cancelPendingHover = () => {
    window.clearTimeout(hoverTimeoutRef.current);
  };

  const dismissPopover = () => {
    cancelPendingHover();
    setOpened(false);
  };

  useEffect(() => cancelPendingHover, []);

  const isSingleEvent = events.length === 1;
  const hasMoreThanMax = events.length > MAX_VISIBLE_EVENTS;
  const canSelect = onSelectTimelineEvents != null;
  const showDetails = !canSelect && onSeeAllEvents == null;
  const showSeeAll = hasMoreThanMax && (canSelect || onSeeAllEvents != null);
  const visibleEvents = showSeeAll
    ? events.slice(0, MAX_VISIBLE_EVENTS)
    : events;

  const isSelected = events.some((event) =>
    selectedEventIds.includes(event.id),
  );
  const areAllEventsSelected = events.every((event) =>
    selectedEventIds.includes(event.id),
  );

  const handleSelect = () => {
    onOpenTimelines?.(isSingleEvent ? undefined : events.map((e) => e.id));
    onSelectTimelineEvents?.(events);
  };

  // a popover that is already open by keyboard keeps its focus handling, so a
  // passing pointer cannot strand the focus inside it
  const openFromPointer = () => {
    if (!openedRef.current) {
      setOpenedByKeyboard(false);
    }
    setOpened(true);
  };

  const handleMouseEnter = () => {
    cancelPendingHover();
    onGroupHover?.(group);
    hoverTimeoutRef.current = window.setTimeout(
      openFromPointer,
      POPOVER_OPEN_DELAY_MS,
    );
  };

  const handleMouseLeave = () => {
    cancelPendingHover();
    onGroupHover?.(null);
    hoverTimeoutRef.current = window.setTimeout(
      () => setOpened(false),
      POPOVER_CLOSE_DELAY_MS,
    );
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && opened) {
      event.stopPropagation();
      dismissPopover();
    }
  };

  const handleBlur = (event: FocusEvent<HTMLButtonElement>) => {
    if (!dropdownRef.current?.contains(event.relatedTarget)) {
      dismissPopover();
    }
    onBlur?.(event);
  };

  const handleChipClick = () => {
    if (areAllEventsSelected) {
      onDeselectTimelineEvents?.();
      onOpenTimelines?.();
    } else {
      handleSelect();
    }
  };

  // "See all" hands the whole cluster to `onSeeAllEvents` when provided (its
  // host renders the full list); otherwise it falls back to the select/open
  // behavior used by the query builder's timeline sidebar.
  const handleSeeAll = () => {
    dismissPopover();
    if (onSeeAllEvents) {
      onSeeAllEvents(events);
    } else {
      handleSelect();
    }
  };

  const chipLabel = isSingleEvent ? events[0].name : t`${events.length} events`;

  // without a select action, activating the chip shows the details that would
  // otherwise only be reachable by hovering; a keyboard activation arrives as
  // a click with no detail count and may also close them
  const handleClick = (event: MouseEvent) => {
    cancelPendingHover();
    if (canSelect) {
      handleChipClick();
    } else if (event.detail === 0) {
      setOpenedByKeyboard(true);
      setOpened((isOpened) => !isOpened);
    } else {
      openFromPointer();
    }
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      onDismiss={() => setOpenedByKeyboard(false)}
      position="top"
      offset={POPOVER_OFFSET}
      shadow="sm"
      withRoles={!canSelect}
      trapFocus={openedByKeyboard}
      returnFocus={openedByKeyboard}
      closeOnEscape
      classNames={{ dropdown: S.bridgeDropdown }}
    >
      <Popover.Target>
        <UnstyledButton
          className={cx(
            S.chip,
            className,
            isSelected && S.chipSelected,
            hidden && S.chipHidden,
          )}
          style={{
            transform: `translate(${x}px, ${centerY}px) translate(-50%, -50%)`,
            width: TIMELINE_EVENTS_BAND.chipWidth,
            height: TIMELINE_EVENTS_BAND.chipHeight,
            zIndex,
          }}
          data-testid="timeline-event-chip"
          data-selected={isSelected}
          data-hidden={hidden}
          aria-hidden={hidden}
          tabIndex={hidden ? -1 : undefined}
          aria-label={chipLabel}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={handleBlur}
        >
          {isSingleEvent ? (
            <Icon name={getTimelineEventGroupIconName(group)} size={12} />
          ) : (
            <Text component="span" size="xs" fw="bold" lh={1}>
              {events.length}
            </Text>
          )}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown
        ref={dropdownRef}
        p={0}
        bdrs="0.75rem"
        onMouseEnter={cancelPendingHover}
        onMouseLeave={handleMouseLeave}
      >
        <div data-testid="timeline-event-popover">
          {isSingleEvent ? (
            <Box
              miw="8rem"
              maw="16rem"
              mah="20rem"
              p="md"
              tabIndex={0}
              style={{ overflowY: "auto" }}
            >
              {showDetails ? (
                <TimelineEventInfo event={events[0]} />
              ) : (
                <TimelineEventRow event={events[0]} showIcon={false} />
              )}
            </Box>
          ) : (
            <>
              <Box
                w="16rem"
                mah="20rem"
                tabIndex={0}
                style={{ overflowY: "auto" }}
              >
                <TimelineEventsList
                  events={visibleEvents}
                  showDetails={showDetails}
                />
              </Box>
              {showSeeAll && (
                <UnstyledButton
                  className={S.seeAllButton}
                  onClick={handleSeeAll}
                >
                  {t`See all`}
                </UnstyledButton>
              )}
            </>
          )}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
};
