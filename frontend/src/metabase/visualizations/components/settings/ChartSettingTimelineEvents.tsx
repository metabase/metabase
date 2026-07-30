import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import { useListTimelinesQuery } from "metabase/api";
import { Group, Loader, Stack, Switch, Text } from "metabase/ui";
import type { Timeline, TimelineId } from "metabase-types/api";

export type ChartSettingTimelineEventsProps = {
  value: TimelineId[] | undefined;
  onChange: (value: TimelineId[]) => void;
};

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
    <Stack gap="lg" data-testid="timeline-events-setting">
      {sortedTimelines.map((timeline) => (
        <Group key={timeline.id} justify="space-between" wrap="nowrap">
          <Stack gap={0}>
            <Text fw="bold">{timeline.name}</Text>
            <Text size="sm" c="text-secondary">
              {getTimelineDescription(timeline)}
            </Text>
          </Stack>
          <Switch
            size="sm"
            role="switch"
            aria-label={timeline.name}
            checked={selectedTimelineIds.has(timeline.id)}
            onChange={(event) =>
              handleToggle(timeline.id, event.currentTarget.checked)
            }
          />
        </Group>
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
