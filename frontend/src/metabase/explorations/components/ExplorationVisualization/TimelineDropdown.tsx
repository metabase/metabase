import { c, t } from "ttag";

import { Button, Combobox, Icon, useCombobox } from "metabase/ui";
import type { Timeline, TimelineId } from "metabase-types/api";

import S from "./TimelineDropdown.module.css";

interface TimelineDropdownProps {
  availableTimelines: Timeline[];
  selectedTimelineIds: Set<TimelineId>;
  onToggleTimelineId: (timelineId: TimelineId) => void;
}

export function TimelineDropdown({
  availableTimelines,
  selectedTimelineIds,
  onToggleTimelineId,
}: TimelineDropdownProps) {
  const combobox = useCombobox();

  if (availableTimelines.length === 0) {
    return null;
  }

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(value) => onToggleTimelineId(Number(value))}
    >
      <Combobox.Target>
        <Button
          w="16rem"
          justify="space-between"
          bg="background-secondary"
          size="xs"
          px="sm"
          fw="normal"
          leftSection={<Icon name="clock" />}
          rightSection={<Icon name="chevrondown" />}
          onClick={() => combobox.toggleDropdown()}
        >
          {getTimelineButtonLabel(availableTimelines, selectedTimelineIds)}
        </Button>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {availableTimelines.map((timeline) => (
            <Combobox.Option
              key={timeline.id}
              value={String(timeline.id)}
              selected={selectedTimelineIds.has(timeline.id)}
              py="sm"
              className={S.option}
            >
              {timeline.name}
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

function getTimelineButtonLabel(
  availableTimelines: Timeline[],
  selectedTimelineIds: Set<TimelineId>,
) {
  if (selectedTimelineIds.size === 0) {
    return t`Select timelines`;
  }
  if (selectedTimelineIds.size === 1) {
    const selectedTimelineId = Array.from(selectedTimelineIds)[0];
    const selectedTimeline = availableTimelines.find(
      (timeline) => timeline.id === selectedTimelineId,
    );
    return selectedTimeline?.name ?? t`Select timelines`;
  }
  return c("{0} is the number of timelines selected")
    .t`${selectedTimelineIds.size} timelines selected`;
}
