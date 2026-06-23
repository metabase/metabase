import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useCommentUrl } from "metabase/documents/hooks/use-comment-url";
import { ActionIcon, Box, Group, Icon, Text, Tooltip } from "metabase/ui";
import type { ExplorationId, Timeline, TimelineId } from "metabase-types/api";

import { TimelineDropdown } from "./TimelineDropdown";

interface ExplorationVisualizationHeaderProps {
  name: string;
  explorationId?: ExplorationId;
  availableTimelines?: Timeline[];
  selectedTimelineId?: TimelineId | null;
  onSelectTimelineId?: (timelineId: TimelineId | null) => void;
  showTimelineDropdown?: boolean;
  interestingTimelineIds?: ReadonlySet<TimelineId>;
  isCommentsSidebarOpen?: boolean;
}

export function ExplorationVisualizationHeader({
  name,
  explorationId,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  showTimelineDropdown,
  interestingTimelineIds,
  isCommentsSidebarOpen,
}: ExplorationVisualizationHeaderProps) {
  const commentUrl = useCommentUrl({});

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
              aria-label={t`Show all comments`}
              variant="viewHeader"
              size="2rem"
              bg={isCommentsSidebarOpen ? "background-brand" : undefined}
            >
              <Icon
                name="comment"
                c={isCommentsSidebarOpen ? "core-brand" : undefined}
              />
            </ActionIcon>
          </Box>
        </Tooltip>
      </Group>
    </Group>
  );
}
