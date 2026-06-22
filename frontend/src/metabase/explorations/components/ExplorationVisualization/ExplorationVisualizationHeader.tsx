import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useCommentUrl } from "metabase/documents/hooks/use-comment-url";
import { ActionIcon, Box, Group, Icon, Text, Tooltip } from "metabase/ui";
import type {
  ExplorationId,
  ExplorationQueryGroupId,
  Timeline,
  TimelineId,
} from "metabase-types/api";

import { TimelineDropdown } from "./TimelineDropdown";

interface ExplorationVisualizationHeaderProps {
  name: string;
  explorationId?: ExplorationId;
  groupId?: ExplorationQueryGroupId;
  availableTimelines?: Timeline[];
  selectedTimelineId?: TimelineId | null;
  onSelectTimelineId?: (timelineId: TimelineId | null) => void;
  showTimelineDropdown?: boolean;
  interestingTimelineIds?: ReadonlySet<TimelineId>;
}

export function ExplorationVisualizationHeader({
  name,
  explorationId,
  groupId,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  showTimelineDropdown,
  interestingTimelineIds,
}: ExplorationVisualizationHeaderProps) {
  const commentUrl = useCommentUrl({
    childTargetId: groupId,
  });

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
        <Tooltip label={t`Show all comments`}>
          <Box>
            <ActionIcon
              component={ForwardRefLink}
              to={commentUrl}
              size="md"
              aria-label={t`Show all comments`}
            >
              <Icon name="comment" />
            </ActionIcon>
          </Box>
        </Tooltip>
      </Group>
    </Group>
  );
}
