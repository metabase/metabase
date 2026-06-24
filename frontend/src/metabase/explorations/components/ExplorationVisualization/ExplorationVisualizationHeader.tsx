import type { Location, LocationDescriptor } from "history";
import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListCommentsQuery } from "metabase/api";
import { getListCommentsQuery } from "metabase/comments/utils";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDispatch } from "metabase/redux";
import { useRouter } from "metabase/router";
import { Group, Indicator, Text } from "metabase/ui";
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
  isCommentsSidebarOpen?: boolean;
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
  isCommentsSidebarOpen,
}: ExplorationVisualizationHeaderProps) {
  const dispatch = useDispatch();
  const { location } = useRouter();
  const nextCommentsUrl = getNextCommentsUrl(location);

  const { data: allComments } = useListCommentsQuery(
    getListCommentsQuery(
      explorationId != null
        ? {
            target_id: explorationId,
            target_type: "exploration",
          }
        : null,
    ),
  );

  const commentsCount = useMemo(() => {
    if (groupId == null) {
      return 0;
    }
    return (
      allComments?.comments.filter(
        (comment) => comment.child_target_id === groupId,
      ).length ?? 0
    );
  }, [allComments, groupId]);

  const ShowCommentsButton = (
    <ToolbarButton
      icon="comment"
      aria-label={
        isCommentsSidebarOpen ? t`Hide comments` : t`Show all comments`
      }
      iconProps={{ size: "1.125rem" }}
      isActive={isCommentsSidebarOpen}
      bg={isCommentsSidebarOpen ? "background-brand" : "background-secondary"}
      bd={
        isCommentsSidebarOpen ? "1px solid border-strong" : "1px solid border"
      }
      onClick={() => {
        dispatch(push(nextCommentsUrl));
      }}
    />
  );

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
        {commentsCount > 0 ? (
          <Indicator label={commentsCount} size={16} color="danger">
            {ShowCommentsButton}
          </Indicator>
        ) : (
          ShowCommentsButton
        )}
      </Group>
    </Group>
  );
}

function getNextCommentsUrl(location: Location): LocationDescriptor {
  const query = { ...location.query };
  if (query?.comments === "true") {
    delete query.comments;
  } else {
    query.comments = "true";
  }
  return {
    pathname: location.pathname,
    query,
  };
}
