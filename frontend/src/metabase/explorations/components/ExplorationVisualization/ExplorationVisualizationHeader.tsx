import { Group, Text } from "metabase/ui";
import type {
  CardDisplayType,
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
  display?: CardDisplayType;
}

export function ExplorationVisualizationHeader({
  explorationQuery,
  explorationThread,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  showTimelineDropdown,
  showDocumentMenu,
  display,
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
            display={display}
          />
        )}
      </Group>
    </Group>
  );
}
