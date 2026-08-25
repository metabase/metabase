import { useCallback, useEffect, useRef } from "react";

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

const MAX_PEEKING_MEMBERS = 4;

interface TimelineEventStackProps {
  cluster: TimelineEventCluster;
  memberXs: number[];
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
  memberXs,
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

  const cancelCollapse = useCallback(() => {
    window.clearTimeout(collapseTimeoutRef.current);
  }, []);

  const scheduleCollapse = useCallback(() => {
    cancelCollapse();
    collapseTimeoutRef.current = window.setTimeout(() => {
      if (!isPointerInsideRef.current) {
        onExpandedChangeRef.current(false);
      }
    }, STACK_COLLAPSE_DELAY_MS);
  }, [cancelCollapse]);

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

  // React's mouse-leave tracking is unreliable across the members' portaled
  // popovers (moving chip → popover → chart never reports leaving the stack),
  // so while expanded the pointer is tracked at the document level instead:
  // anything hovered outside the stack and its popovers collapses it.
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
  }, [isExpanded, cancelCollapse, scheduleCollapse]);

  useEffect(() => cancelCollapse, [cancelCollapse]);

  const availableWidth = plotBounds.right - plotBounds.left;
  const spreadStep =
    count > 1
      ? Math.min(
          chipWidth + chipGap,
          Math.max((availableWidth - chipWidth) / (count - 1), 0),
        )
      : 0;
  const spreadWidth = chipWidth + (count - 1) * spreadStep;
  const clusterMidpointX = (memberXs[0] + memberXs[memberXs.length - 1]) / 2;
  const spreadCenter = getSpreadCenter(
    clusterMidpointX,
    spreadWidth,
    plotBounds,
  );
  const collapsedExtent =
    Math.min(count - 1, MAX_PEEKING_MEMBERS) * stackCollapsedOffset;
  const collapsedAnchorX = Math.min(
    memberXs[0],
    plotBounds.right - collapsedExtent,
  );
  const getMemberX = (index: number) =>
    isExpanded
      ? spreadCenter + (index - (count - 1) / 2) * spreadStep
      : collapsedAnchorX +
        Math.min(index, MAX_PEEKING_MEMBERS) * stackCollapsedOffset;

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
