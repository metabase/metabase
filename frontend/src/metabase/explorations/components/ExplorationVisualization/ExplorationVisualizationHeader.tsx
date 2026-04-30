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
  selectedTimelineIds?: Set<TimelineId>;
  onToggleTimelineId?: (timelineId: TimelineId) => void;
  showTimelineDropdown?: boolean;
}

export function ExplorationVisualizationHeader({
  explorationQuery,
  availableTimelines,
  selectedTimelineIds,
  onToggleTimelineId,
  showTimelineDropdown,
}: ExplorationVisualizationHeaderProps) {
  return (
    <Group h="2rem" justify="space-between">
      <Text fw="bold" size="lg">
        {explorationQuery.name}
      </Text>
      {showTimelineDropdown &&
        availableTimelines &&
        selectedTimelineIds &&
        onToggleTimelineId && (
          <TimelineDropdown
            availableTimelines={availableTimelines}
            selectedTimelineIds={selectedTimelineIds}
            onToggleTimelineId={onToggleTimelineId}
          />
        )}
    </Group>
  );
}
