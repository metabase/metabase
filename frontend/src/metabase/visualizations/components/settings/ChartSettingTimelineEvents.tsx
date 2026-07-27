import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import { useListTimelinesQuery } from "metabase/api";
import { Checkbox, Loader, Stack, Text } from "metabase/ui";
import type { Timeline, TimelineId } from "metabase-types/api";

interface ChartSettingTimelineEventsProps {
  value: TimelineId[] | undefined;
  onChange: (value: TimelineId[]) => void;
}

export const ChartSettingTimelineEvents = ({
  value,
  onChange,
}: ChartSettingTimelineEventsProps) => {
  const { data: timelines = [], isLoading } = useListTimelinesQuery({
    include: "events",
  });

  const sortedTimelines = useMemo(
    () => [...timelines].sort(compareTimelines),
    [timelines],
  );

  if (isLoading) {
    return <Loader size="sm" data-testid="timeline-events-setting-loader" />;
  }

  if (sortedTimelines.length === 0) {
    return (
      <Text c="text-secondary" size="sm">
        {t`No timelines yet. You can create events from a question's timeline sidebar.`}
      </Text>
    );
  }

  const selectedTimelineIds = new Set(value ?? []);

  const handleToggle = (timelineId: TimelineId, isSelected: boolean) => {
    const nextValue = isSelected
      ? [...(value ?? []), timelineId]
      : (value ?? []).filter((id) => id !== timelineId);
    onChange(nextValue);
  };

  return (
    <Stack gap="sm" data-testid="timeline-events-setting">
      {sortedTimelines.map((timeline) => (
        <Checkbox
          key={timeline.id}
          checked={selectedTimelineIds.has(timeline.id)}
          label={timeline.name}
          description={getTimelineDescription(timeline)}
          onChange={(event) =>
            handleToggle(timeline.id, event.currentTarget.checked)
          }
        />
      ))}
    </Stack>
  );
};

function getTimelineDescription(timeline: Timeline) {
  const collectionName = timeline.collection?.name ?? t`Our analytics`;
  const eventCount = timeline.events?.length ?? 0;
  const eventCountLabel = ngettext(
    msgid`${eventCount} event`,
    `${eventCount} events`,
    eventCount,
  );
  return `${collectionName} · ${eventCountLabel}`;
}

function compareTimelines(timelineA: Timeline, timelineB: Timeline) {
  const collectionA = timelineA.collection?.name ?? "";
  const collectionB = timelineB.collection?.name ?? "";
  return (
    collectionA.localeCompare(collectionB) ||
    timelineA.name.localeCompare(timelineB.name)
  );
}
