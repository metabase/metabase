import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import { useListTimelinesQuery } from "metabase/api";
import { getCollectionName } from "metabase/common/collections/utils";
import {
  getEventCount,
  getSortedTimelines,
  getTimelineName,
} from "metabase/common/utils/timelines";
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
  // Events are hydrated only to derive the counts below; swap to a dedicated
  // event_count field if the payload ever becomes a problem.
  const { data: timelines = [], isLoading } = useListTimelinesQuery({
    include: "events",
  });

  const sortedTimelines = useMemo(
    () => getSortedTimelines(timelines),
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
            <Text fw="bold">{getTimelineName(timeline)}</Text>
            <Text size="sm" c="text-secondary">
              {getTimelineDescription(timeline)}
            </Text>
          </Stack>
          <Switch
            size="sm"
            role="switch"
            aria-label={getTimelineName(timeline)}
            checked={(value ?? []).includes(timeline.id)}
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
  const eventCount = getEventCount(timeline);
  const eventCountLabel = ngettext(
    msgid`${eventCount} event`,
    `${eventCount} events`,
    eventCount,
  );
  return `${getCollectionName(timeline.collection)} · ${eventCountLabel}`;
}
