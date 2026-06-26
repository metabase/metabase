import type { Location, LocationDescriptor } from "history";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useUnresolvedCommentsCount } from "metabase/comments/hooks/use-unresolved-comments-count";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDispatch } from "metabase/redux";
import { useRouter } from "metabase/router";
import { Group, Indicator, Text } from "metabase/ui";
import type { ExplorationId, ExplorationPageNodeId } from "metabase-types/api";

interface ExplorationVisualizationHeaderProps {
  name: string;
  explorationId?: ExplorationId;
  pageId?: ExplorationPageNodeId;
  isCommentsSidebarOpen?: boolean;
  showCommentsButton?: boolean;
}

export function ExplorationVisualizationHeader({
  name,
  explorationId,
  pageId,
  isCommentsSidebarOpen,
  showCommentsButton,
}: ExplorationVisualizationHeaderProps) {
  const dispatch = useDispatch();
  const { location } = useRouter();
  const nextCommentsUrl = getNextCommentsUrl(location);
  const unresolvedCommentsCount = useUnresolvedCommentsCount({
    target:
      explorationId != null
        ? {
            target_id: explorationId,
            target_type: "exploration",
          }
        : undefined,
    childTargetId: pageId,
  });

  const ShowCommentsButton = showCommentsButton ? (
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
  ) : null;
  return (
    <Group h="2rem" justify="space-between" style={{ flexShrink: 0 }}>
      <Text fw="bold" size="lg">
        {name}
      </Text>
      <Group align="center" gap="sm">
        {unresolvedCommentsCount > 0 ? (
          <Indicator label={unresolvedCommentsCount} size={16} color="danger">
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
