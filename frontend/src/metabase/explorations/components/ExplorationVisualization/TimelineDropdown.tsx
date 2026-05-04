import { useEffect } from "react";
import { t } from "ttag";

import {
  getAdjacentById,
  shouldIgnoreKeyboardEvent,
} from "metabase/explorations/utils";
import { Icon, Select } from "metabase/ui";
import type { Timeline, TimelineId } from "metabase-types/api";

import S from "./TimelineDropdown.module.css";

interface TimelineDropdownProps {
  availableTimelines: Timeline[];
  selectedTimelineId: TimelineId | null;
  onSelectTimelineId: (timelineId: TimelineId | null) => void;
}

export function TimelineDropdown({
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
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
        onSelectTimelineId(nextTimeline.id);
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [availableTimelines, selectedTimelineId, onSelectTimelineId]);

  return (
    <Select<string | null>
      aria-label={t`Select timeline`}
      data={availableTimelines.map((timeline) => ({
        value: String(timeline.id),
        label: timeline.name,
      }))}
      value={selectedTimelineId == null ? null : String(selectedTimelineId)}
      onChange={(value) =>
        onSelectTimelineId(value == null ? null : Number(value))
      }
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
    />
  );
}
