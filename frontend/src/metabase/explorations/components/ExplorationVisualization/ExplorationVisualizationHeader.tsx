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
  name: string | null;
  explorationQuery?: ExplorationQuery;
  explorationThread?: ExplorationThread;
  availableTimelines?: Timeline[];
  selectedTimelineId?: TimelineId | null;
  onSelectTimelineId?: (timelineId: TimelineId | null) => void;
  showTimelineDropdown?: boolean;
  showDocumentMenu?: boolean;
  display?: CardDisplayType;
}

export function ExplorationVisualizationHeader({
  name,
  explorationQuery,
  explorationThread,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  showTimelineDropdown,
  showDocumentMenu,
  display,
}: ExplorationVisualizationHeaderProps) {
  const title = name ?? explorationQuery?.name ?? null;
  return (
    <Group h="2rem" justify="space-between">
      <Text fw="bold" size="lg">
        {title}
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
        {explorationQuery && explorationThread && showDocumentMenu && (
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
