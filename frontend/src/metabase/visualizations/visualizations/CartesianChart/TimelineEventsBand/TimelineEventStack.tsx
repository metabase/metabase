import { useEffect, useRef } from "react";

import {
  TIMELINE_BAND_HEIGHT,
  TIMELINE_EVENTS_BAND,
} from "metabase/visualizations/echarts/cartesian/constants/style";
import type {
  TimelineEventCluster,
  TimelineEventGroup,
} from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type { TimelineEvent, TimelineEventId } from "metabase-types/api";

import { TimelineEventChip } from "./TimelineEventChip";
import S from "./TimelineEventsBand.module.css";

// Matches the popover's closeDelay so moving between spread members (or into
// an open popover) does not collapse the stack.
const STACK_COLLAPSE_DELAY_MS = 150;

interface TimelineEventStackProps {
  cluster: TimelineEventCluster;
  x: number;
  centerY: number;
  plotBounds: { left: number; right: number };
  isExpanded: boolean;
  hidden: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  selectedEventIds: TimelineEventId[];
  onGroupHover?: (group: TimelineEventGroup | null) => void;
  onOpenTimelines?: (eventIds?: number[]) => void;
  onSelectTimelineEvents?: (events: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
  onSeeAllEvents?: (events: TimelineEvent[]) => void;
}

const getSpreadCenter = (
  x: number,
  spreadWidth: number,
  plotBounds: { left: number; right: number },
) => {
  const minCenter = plotBounds.left + spreadWidth / 2;
  const maxCenter = Math.max(plotBounds.right - spreadWidth / 2, minCenter);
  return Math.min(Math.max(x, minCenter), maxCenter);
};

export const TimelineEventStack = ({
  cluster,
  x,
  centerY,
  plotBounds,
  isExpanded,
  hidden,
  onExpandedChange,
  selectedEventIds,
  onGroupHover,
  onOpenTimelines,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
  onSeeAllEvents,
}: TimelineEventStackProps) => {
  const { chipWidth, chipGap, stackCollapsedOffset } = TIMELINE_EVENTS_BAND;
  const { groups } = cluster;
  const count = groups.length;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const collapseTimeoutRef = useRef<number>();
  const isPointerInsideRef = useRef(false);
  const onExpandedChangeRef = useRef(onExpandedChange);
  onExpandedChangeRef.current = onExpandedChange;

  const cancelCollapse = () => {
    window.clearTimeout(collapseTimeoutRef.current);
  };

  const scheduleCollapse = () => {
    cancelCollapse();
    collapseTimeoutRef.current = window.setTimeout(() => {
      if (!isPointerInsideRef.current) {
        onExpandedChangeRef.current(false);
      }
    }, STACK_COLLAPSE_DELAY_MS);
  };

  const handlePointerEnter = () => {
    isPointerInsideRef.current = true;
    cancelCollapse();
    onExpandedChange(true);
  };

  const handlePointerLeave = () => {
    isPointerInsideRef.current = false;
    scheduleCollapse();
  };

  const handleMemberFocus = () => {
    cancelCollapse();
    onExpandedChange(true);
  };

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const handleDocumentMouseOver = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const isInside =
        wrapperRef.current?.contains(target) ||
        target.closest(`.${S.bridgeDropdown}`) != null;

      isPointerInsideRef.current = Boolean(isInside);
      if (isInside) {
        cancelCollapse();
      } else {
        scheduleCollapse();
      }
    };

    document.addEventListener("mouseover", handleDocumentMouseOver);
    return () => {
      document.removeEventListener("mouseover", handleDocumentMouseOver);
    };
    // the handler only touches refs, so it needs no other dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);

  useEffect(() => cancelCollapse, []);

  const availableWidth = plotBounds.right - plotBounds.left;
  const spreadStep =
    count > 1
      ? Math.min(
          chipWidth + chipGap,
          Math.max((availableWidth - chipWidth) / (count - 1), 0),
        )
      : 0;
  const spreadWidth = chipWidth + (count - 1) * spreadStep;
  const spreadCenter = getSpreadCenter(x, spreadWidth, plotBounds);
  const getMemberX = (index: number) =>
    isExpanded
      ? spreadCenter + (index - (count - 1) / 2) * spreadStep
      : x - (count - 1 - index) * stackCollapsedOffset;

  return (
    <div
      ref={wrapperRef}
      className={hidden ? S.stackHidden : undefined}
      data-testid="timeline-event-stack"
      data-expanded={isExpanded}
      onMouseEnter={hidden ? undefined : handlePointerEnter}
      onMouseLeave={handlePointerLeave}
    >
      {isExpanded && !hidden && (
        <div
          className={S.stackHoverPad}
          style={{
            left: spreadCenter - spreadWidth / 2,
            top: centerY - TIMELINE_BAND_HEIGHT / 2,
            width: spreadWidth,
            height: TIMELINE_BAND_HEIGHT,
          }}
        />
      )}
      {groups.map((group, index) => {
        return (
          <TimelineEventChip
            key={group.date}
            group={group}
            x={getMemberX(index)}
            centerY={centerY}
            zIndex={index}
            className={S.stackMember}
            hidden={hidden}
            selectedEventIds={selectedEventIds}
            onFocus={handleMemberFocus}
            onBlur={scheduleCollapse}
            onGroupHover={onGroupHover}
            onOpenTimelines={onOpenTimelines}
            onSelectTimelineEvents={onSelectTimelineEvents}
            onDeselectTimelineEvents={onDeselectTimelineEvents}
            onSeeAllEvents={onSeeAllEvents}
          />
        );
      })}
    </div>
  );
};
