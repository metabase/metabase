import { Group, Text } from "metabase/ui";
import type {
  ExplorationId,
  ExplorationQuery,
  ExplorationThread,
  Timeline,
  TimelineId,
} from "metabase-types/api";

import { GroupDocumentMenu } from "./GroupDocumentMenu";
import { TimelineDropdown } from "./TimelineDropdown";
import type { ExplorationChartForDocumentEmbed } from "./utils";

interface ExplorationVisualizationHeaderProps {
  name: string;
  explorationId?: ExplorationId;
  explorationQuery?: ExplorationQuery;
  explorationThread?: ExplorationThread;
  availableTimelines?: Timeline[];
  selectedTimelineId?: TimelineId | null;
  onSelectTimelineId?: (timelineId: TimelineId | null) => void;
  showTimelineDropdown?: boolean;
  showDocumentMenu?: boolean;
  chartsForEmbed?: ExplorationChartForDocumentEmbed[];
  interestingTimelineIds?: ReadonlySet<TimelineId>;
}

export function ExplorationVisualizationHeader({
  name,
  explorationId,
  explorationThread,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  showTimelineDropdown,
  showDocumentMenu,
  chartsForEmbed,
  interestingTimelineIds,
}: ExplorationVisualizationHeaderProps) {
  const showGroupDocumentMenu =
    showDocumentMenu &&
    explorationThread &&
    chartsForEmbed &&
    chartsForEmbed.length > 0;

  return (
    <Group h="2rem" justify="space-between" style={{ flexShrink: 0 }}>
      <Text fw="bold" size="lg">
        {name}
      </Text>
      <Group align="center" gap="sm">
        {showTimelineDropdown &&
          availableTimelines &&
          availableTimelines.length > 0 &&
          selectedTimelineId !== undefined &&
          onSelectTimelineId &&
          explorationId != null && (
            <TimelineDropdown
              explorationId={explorationId}
              availableTimelines={availableTimelines}
              selectedTimelineId={selectedTimelineId}
              onSelectTimelineId={onSelectTimelineId}
              interestingTimelineIds={interestingTimelineIds}
            />
          )}
        {showGroupDocumentMenu && (
          <GroupDocumentMenu
            charts={chartsForEmbed}
            explorationThread={explorationThread}
          />
        )}
      </Group>
    </Group>
  );
}
