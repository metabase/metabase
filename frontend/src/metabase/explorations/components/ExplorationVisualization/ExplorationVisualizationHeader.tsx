import { t } from "ttag";

import { useUnresolvedCommentsCount } from "metabase/comments/hooks/use-unresolved-comments-count";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { type Path, useLocation, useNavigate } from "metabase/router";
import { Ellipsified, Group, Indicator, Stack } from "metabase/ui";
import type {
  ExplorationId,
  ExplorationPageNodeId,
  HydratedExplorationExploreFilter,
} from "metabase-types/api";

import { ExploreFilterPills } from "../ExploreFilterPills";

interface ExplorationVisualizationHeaderProps {
  name: string;
  exploreFilters?: HydratedExplorationExploreFilter[] | null;
  explorationId?: ExplorationId;
  pageId?: ExplorationPageNodeId;
  isCommentsSidebarOpen?: boolean;
  showCommentsButton?: boolean;
}

export function ExplorationVisualizationHeader({
  name,
  exploreFilters,
  explorationId,
  pageId,
  isCommentsSidebarOpen,
  showCommentsButton,
}: ExplorationVisualizationHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const nextCommentsUrl = getNextCommentsUrl(location, pageId);
  const { allCommentsCount } = useUnresolvedCommentsCount({
    target:
      explorationId != null
        ? {
            target_id: explorationId,
            target_type: "exploration",
          }
        : undefined,
    childTargetId: pageId,
  });

  const commentsButton = showCommentsButton ? (
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
        navigate(nextCommentsUrl);
      }}
    />
  ) : null;

  return (
    <Stack gap="sm" style={{ flexShrink: 0 }}>
      <Group h="2rem" justify="space-between" wrap="nowrap" miw={0}>
        <Ellipsified fw="bold" fz="lg" flex={1} miw={0}>
          {name}
        </Ellipsified>
        <Group align="center" gap="sm" style={{ flexShrink: 0 }}>
          {allCommentsCount > 0 ? (
            <Indicator label={allCommentsCount} size={16} color="core-info">
              {commentsButton}
            </Indicator>
          ) : (
            commentsButton
          )}
        </Group>
      </Group>
      <ExploreFilterPills filters={exploreFilters ?? []} />
    </Stack>
  );
}

function getNextCommentsUrl(
  location: Pick<Path, "pathname" | "search">,
  pageId?: ExplorationPageNodeId,
) {
  const search = new URLSearchParams(location.search);
  if (search.get("comments") != null) {
    search.delete("comments");
  } else if (pageId != null) {
    search.set("comments", String(pageId));
  } else {
    search.set("comments", "true");
  }
  const searchString = search.toString();
  return `${location.pathname}${searchString ? `?${searchString}` : ""}`;
}
