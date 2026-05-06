import { Group, Text } from "metabase/ui";
import type {
  CardDisplayType,
  ExplorationQuery,
  ExplorationThread,
  Timeline,
  TimelineId,
} from "metabase-types/api";

import { DocumentMenu } from "./DocumentMenu";
import { GroupDocumentMenu } from "./GroupDocumentMenu";
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
  /**
   * When provided alongside `showDocumentMenu`, the header renders a
   * `GroupDocumentMenu` (chart-picker → document-picker) instead of the
   * single-chart `DocumentMenu`. Used by `ExplorationGroupVisualization`.
   */
  groupQueries?: ExplorationQuery[];
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
  groupQueries,
}: ExplorationVisualizationHeaderProps) {
  const title = name ?? explorationQuery?.name ?? null;
  const showGroupDocumentMenu =
    showDocumentMenu &&
    explorationThread &&
    groupQueries &&
    groupQueries.length > 0;
  const showSingleDocumentMenu =
    showDocumentMenu &&
    !showGroupDocumentMenu &&
    explorationQuery &&
    explorationThread;

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
        {showGroupDocumentMenu && (
          <GroupDocumentMenu
            queries={groupQueries}
            explorationThread={explorationThread}
            display={display}
          />
        )}
        {showSingleDocumentMenu && (
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
