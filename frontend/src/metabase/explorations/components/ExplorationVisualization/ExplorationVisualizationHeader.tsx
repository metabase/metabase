import { useMemo } from "react";

import { Group, Text } from "metabase/ui";
import type {
  CardDisplayType,
  ExplorationQuery,
  ExplorationThread,
  Timeline,
  TimelineId,
  VisualizationSettings,
} from "metabase-types/api";

import { DocumentMenu } from "./DocumentMenu";
import { GroupDocumentMenu } from "./GroupDocumentMenu";
import { TimelineDropdown } from "./TimelineDropdown";

interface ExplorationVisualizationHeaderProps {
  name: string;
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
  interestingTimelineIds?: ReadonlySet<TimelineId>;
}

export function ExplorationVisualizationHeader({
  name,
  explorationThread,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  showTimelineDropdown,
  showDocumentMenu,
  display,
  groupQueries,
  interestingTimelineIds,
}: ExplorationVisualizationHeaderProps) {
  const showGroupDocumentMenu =
    showDocumentMenu &&
    explorationThread &&
    groupQueries &&
    groupQueries.length > 1;
  const showSingleDocumentMenu =
    showDocumentMenu &&
    !showGroupDocumentMenu &&
    explorationThread &&
    groupQueries?.length === 1;

  const vizSettings: VisualizationSettings = useMemo(() => {
    if (selectedTimelineId) {
      return {
        "timeline.selected_timeline_ids": [selectedTimelineId],
      };
    }
    return {};
  }, [selectedTimelineId]);

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
          onSelectTimelineId && (
            <TimelineDropdown
              availableTimelines={availableTimelines}
              selectedTimelineId={selectedTimelineId}
              onSelectTimelineId={onSelectTimelineId}
              interestingTimelineIds={interestingTimelineIds}
            />
          )}
        {showGroupDocumentMenu && (
          <GroupDocumentMenu
            queries={groupQueries}
            explorationThread={explorationThread}
            display={display}
            vizSettings={vizSettings}
          />
        )}
        {showSingleDocumentMenu && (
          <DocumentMenu
            explorationQuery={groupQueries?.[0]}
            explorationThread={explorationThread}
            display={display}
            vizSettings={vizSettings}
          />
        )}
      </Group>
    </Group>
  );
}
