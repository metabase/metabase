import { Group, Text } from "metabase/ui";
import type {
  ExplorationQuery,
  ExplorationThread,
  Timeline,
  TimelineId,
} from "metabase-types/api";

import { DocumentMenu } from "./DocumentMenu";
import { TimelineDropdown } from "./TimelineDropdown";

interface ExplorationVisualizationHeaderProps {
  explorationQuery: ExplorationQuery;
  explorationThread?: ExplorationThread;
  availableTimelines?: Timeline[];
  selectedTimelineId?: TimelineId | null;
  onSelectTimelineId?: (timelineId: TimelineId | null) => void;
  showTimelineDropdown?: boolean;
  showDocumentMenu?: boolean;
}

export function ExplorationVisualizationHeader({
  explorationQuery,
  explorationThread,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  showTimelineDropdown,
  showDocumentMenu,
}: ExplorationVisualizationHeaderProps) {
  return (
    <Group h="2rem" justify="space-between">
      <Text fw="bold" size="lg">
        {explorationQuery.name}
      </Text>
      <Group align="center" gap="sm">
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
        {explorationThread && showDocumentMenu && (
          <DocumentMenu
            explorationQuery={explorationQuery}
            explorationThread={explorationThread}
          />
        )}
      </Group>
    </Group>
  );
}
