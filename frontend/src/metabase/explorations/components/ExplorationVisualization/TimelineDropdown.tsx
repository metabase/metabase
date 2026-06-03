import { useEffect } from "react";
import { t } from "ttag";

import { trackExplorationTimelineChanged } from "metabase/explorations/analytics";
import {
  getAdjacentById,
  shouldIgnoreKeyboardEvent,
} from "metabase/explorations/utils";
import { Group, Icon, Select, Text } from "metabase/ui";
import type { ExplorationId, Timeline, TimelineId } from "metabase-types/api";

import { PotentiallyInterestingMarker } from "../PotentiallyInterestingMarker";

import S from "./TimelineDropdown.module.css";

interface TimelineDropdownProps {
  explorationId: ExplorationId;
  availableTimelines: Timeline[];
  selectedTimelineId: TimelineId | null;
  onSelectTimelineId: (timelineId: TimelineId | null) => void;
  interestingTimelineIds?: ReadonlySet<TimelineId>;
}

export function TimelineDropdown({
  explorationId,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  interestingTimelineIds,
}: TimelineDropdownProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }
      if (shouldIgnoreKeyboardEvent(event)) {
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextTimeline = getAdjacentById(
        availableTimelines,
        selectedTimelineId,
        direction,
      );
      if (nextTimeline != null && nextTimeline.id !== selectedTimelineId) {
        trackExplorationTimelineChanged(explorationId, "keyboard");
        onSelectTimelineId(nextTimeline.id);
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    availableTimelines,
    explorationId,
    selectedTimelineId,
    onSelectTimelineId,
  ]);

  return (
    <Select<string | null>
      aria-label={t`Select timeline`}
      data={availableTimelines.map((timeline) => ({
        value: String(timeline.id),
        label: timeline.name,
      }))}
      value={selectedTimelineId == null ? null : String(selectedTimelineId)}
      onChange={(value) => {
        trackExplorationTimelineChanged(explorationId, "click");
        onSelectTimelineId(value == null ? null : Number(value));
      }}
      placeholder={t`Select timeline`}
      clearable
      w="16rem"
      bg="background-secondary"
      leftSection={<Icon name="clock" />}
      classNames={{
        input: S.selectInput,
      }}
      clearButtonProps={{
        bg: "background-secondary",
        c: "text-primary",
      }}
      renderOption={({ option }) => {
        const id = Number(option.value);
        const isInteresting = interestingTimelineIds?.has(id) ?? false;
        return (
          <Group gap="xs" py="xs" px="sm" wrap="nowrap" w="100%">
            <Text flex={1}>{option.label}</Text>
            {isInteresting && <PotentiallyInterestingMarker />}
          </Group>
        );
      }}
    />
  );
}
