import type { Location, LocationDescriptor } from "history";
import { t } from "ttag";

import { useUnresolvedCommentsCount } from "metabase/comments/hooks/use-unresolved-comments-count";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDispatch } from "metabase/redux";
import { push, useRouter } from "metabase/router";
import { Ellipsified, Group, Indicator } from "metabase/ui";
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
  const { unresolvedCommentsCount, allCommentsCount } =
    useUnresolvedCommentsCount({
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
    <Group
      h="2rem"
      justify="space-between"
      wrap="nowrap"
      miw={0}
      style={{ flexShrink: 0 }}
    >
      <Ellipsified fw="bold" fz="lg" flex={1} miw={0}>
        {name}
      </Ellipsified>
      <Group align="center" gap="sm" style={{ flexShrink: 0 }}>
        {unresolvedCommentsCount > 0 || allCommentsCount > 0 ? (
          <Indicator
            label={
              unresolvedCommentsCount > 0
                ? unresolvedCommentsCount
                : allCommentsCount
            }
            size={16}
            color={unresolvedCommentsCount > 0 ? "danger" : "core-info"}
          >
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
