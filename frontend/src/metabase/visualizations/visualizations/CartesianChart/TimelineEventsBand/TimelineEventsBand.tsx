import type { EChartsType } from "echarts/core";
import { useCallback, useEffect, useState } from "react";

import {
  type ChartLayout,
  TIMELINE_BAND_HEIGHT,
  TIMELINE_EVENTS_BAND,
  type TimelineEventGroup,
  type TimelineEventsModel,
} from "metabase/viz-core";
import type { TimelineEvent, TimelineEventId } from "metabase-types/api";

import { TimelineEventChip } from "./TimelineEventChip";
import { TimelineEventStack } from "./TimelineEventStack";
import S from "./TimelineEventsBand.module.css";
import {
  type PositionedTimelineEventCluster,
  arePositionedClustersEqual,
  getPositionedTimelineEventClusters,
} from "./utils";

interface TimelineEventsBandProps {
  chartInstance?: EChartsType;
  chartSize: { width: number; height: number };
  timelineEventsModel: TimelineEventsModel | null;
  chartLayout: ChartLayout;
  xAxisIndex: number;
  selectedTimelineEventIds?: TimelineEventId[];
  onGroupHover?: (group: TimelineEventGroup | null) => void;
  onOpenTimelines?: (eventIds?: number[]) => void;
  onSelectTimelineEvents?: (events: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
  onSeeAllEvents?: (events: TimelineEvent[]) => void;
}

export const TimelineEventsBand = ({
  chartInstance,
  chartSize,
  timelineEventsModel,
  chartLayout,
  xAxisIndex,
  selectedTimelineEventIds,
  onGroupHover,
  onOpenTimelines,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
  onSeeAllEvents,
}: TimelineEventsBandProps) => {
  const gridBottom = chartSize.height - chartLayout.padding.bottom;
  const trackTop = gridBottom + TIMELINE_EVENTS_BAND.marginY;
  const centerY = trackTop + TIMELINE_BAND_HEIGHT / 2;

  const plotLeft = chartLayout.padding.left;
  const plotRight = chartSize.width - chartLayout.padding.right;

  const [positionedClusters, setPositionedClusters] = useState<
    PositionedTimelineEventCluster[]
  >([]);

  const [expandedClusterDate, setExpandedClusterDate] = useState<string | null>(
    null,
  );

  const updatePositionedClusters = useCallback(() => {
    const canPosition =
      chartInstance != null &&
      timelineEventsModel != null &&
      timelineEventsModel.length > 0 &&
      chartSize.width > 0;

    const next = canPosition
      ? getPositionedTimelineEventClusters({
          timelineEventsModel,
          chartInstance,
          plotBounds: { left: plotLeft, right: plotRight },
          xAxisIndex,
        })
      : [];

    setPositionedClusters((previous) =>
      arePositionedClustersEqual(previous, next) ? previous : next,
    );
  }, [
    chartInstance,
    timelineEventsModel,
    plotLeft,
    plotRight,
    xAxisIndex,
    chartSize.width,
  ]);

  useEffect(() => {
    updatePositionedClusters();
  }, [updatePositionedClusters]);

  useEffect(() => {
    if (!chartInstance) {
      return;
    }
    chartInstance.on("finished", updatePositionedClusters);
    return () => {
      chartInstance.off("finished", updatePositionedClusters);
    };
  }, [chartInstance, updatePositionedClusters]);

  // Collapse any spread stack when the chart genuinely re-lays-out; the
  // equality bail-out above keeps ECharts "finished" events from firing this.
  useEffect(() => {
    setExpandedClusterDate(null);
  }, [positionedClusters]);

  if (positionedClusters.length === 0) {
    return null;
  }

  return (
    <div className={S.band} data-testid="timeline-events-band">
      <div
        className={S.track}
        style={{
          left: plotLeft,
          width: plotRight - plotLeft,
          top: trackTop,
          height: TIMELINE_BAND_HEIGHT,
        }}
      />
      {positionedClusters.map(({ cluster, memberXs }) => {
        const isHidden =
          expandedClusterDate != null && expandedClusterDate !== cluster.date;

        if (cluster.groups.length === 1) {
          return (
            <TimelineEventChip
              key={cluster.date}
              group={cluster.groups[0]}
              x={memberXs[0]}
              centerY={centerY}
              hidden={isHidden}
              selectedEventIds={selectedTimelineEventIds ?? []}
              onGroupHover={onGroupHover}
              onOpenTimelines={onOpenTimelines}
              onSelectTimelineEvents={onSelectTimelineEvents}
              onDeselectTimelineEvents={onDeselectTimelineEvents}
              onSeeAllEvents={onSeeAllEvents}
            />
          );
        }

        return (
          <TimelineEventStack
            key={cluster.date}
            cluster={cluster}
            memberXs={memberXs}
            centerY={centerY}
            plotBounds={{ left: plotLeft, right: plotRight }}
            hidden={isHidden}
            isExpanded={expandedClusterDate === cluster.date}
            onExpandedChange={(isExpanded) =>
              setExpandedClusterDate(isExpanded ? cluster.date : null)
            }
            selectedEventIds={selectedTimelineEventIds ?? []}
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
