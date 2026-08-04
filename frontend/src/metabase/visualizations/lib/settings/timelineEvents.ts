import type { VisualizationSettingsDefinitions } from "metabase/visualizations/types";
import type { Timeline, TimelineEventId, TimelineId } from "metabase-types/api";

export const TIMELINE_EVENTS_SETTINGS: VisualizationSettingsDefinitions = {
  "timeline.selected_timeline_ids": {
    hidden: true,
    getDefault: () => [],
  },
  "timeline.excluded_timeline_event_ids": {
    hidden: true,
    getDefault: () => [],
  },
};

export function getTimelineEventSettings(
  timelines: Timeline[],
  selectedTimelineEventIds: TimelineEventId[],
) {
  const timelineEventIdToTimelineId = new Map<TimelineEventId, TimelineId>();
  for (const timeline of timelines) {
    for (const event of timeline.events ?? []) {
      timelineEventIdToTimelineId.set(event.id, timeline.id);
    }
  }

  const timelineIdToSelectedTimelineEventIds = new Map<
    TimelineId,
    Set<TimelineEventId>
  >();
  for (const id of selectedTimelineEventIds) {
    const timelineId = timelineEventIdToTimelineId.get(id);
    if (timelineId) {
      const selectedTimelineEventIds =
        timelineIdToSelectedTimelineEventIds.get(timelineId);
      if (selectedTimelineEventIds) {
        selectedTimelineEventIds.add(id);
      } else {
        timelineIdToSelectedTimelineEventIds.set(timelineId, new Set([id]));
      }
    }
  }

  const selectedTimelineIds: TimelineId[] = [];
  const excludedTimelineEventIds: TimelineEventId[] = [];

  for (const timeline of timelines) {
    const selected = timelineIdToSelectedTimelineEventIds.get(timeline.id);
    if (!timeline.events || !selected || selected.size === 0) {
      continue;
    }
    selectedTimelineIds.push(timeline.id);
    for (const event of timeline.events) {
      if (!selected.has(event.id)) {
        excludedTimelineEventIds.push(event.id);
      }
    }
  }

  return {
    "timeline.selected_timeline_ids": selectedTimelineIds,
    "timeline.excluded_timeline_event_ids": excludedTimelineEventIds,
  };
}
