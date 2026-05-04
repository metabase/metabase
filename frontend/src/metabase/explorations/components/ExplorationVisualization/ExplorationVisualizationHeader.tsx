import { Group, Text } from "metabase/ui";
import type {
  ExplorationQuery,
  Timeline,
  TimelineId,
} from "metabase-types/api";

import { TimelineDropdown } from "./TimelineDropdown";

interface ExplorationVisualizationHeaderProps {
  explorationQuery: ExplorationQuery;
  availableTimelines?: Timeline[];
  selectedTimelineId?: TimelineId | null;
  onSelectTimelineId?: (timelineId: TimelineId | null) => void;
  showTimelineDropdown?: boolean;
}

export function ExplorationVisualizationHeader({
  explorationQuery,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  showTimelineDropdown,
}: ExplorationVisualizationHeaderProps) {
  return (
    <Group h="2rem" justify="space-between">
      <Text fw="bold" size="lg">
        {explorationQuery.name}
      </Text>
      {showTimelineDropdown &&
        availableTimelines &&
        availableTimelines.length > 0 &&
        selectedTimelineId !== undefined &&
        onSelectTimelineId && (
          <TimelineDropdown
            availableTimelines={availableTimelines}
            selectedTimelineId={selectedTimelineId}
            onSelectTimelineId={onSelectTimelineId}
          />
        )}
    </Group>
  );
}
