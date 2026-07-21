import type { Location, LocationDescriptor } from "history";
import { t } from "ttag";

import { useUnresolvedCommentsCount } from "metabase/comments/hooks/use-unresolved-comments-count";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { useDispatch } from "metabase/redux";
import { push, useRouter } from "metabase/router";
import { Ellipsified, Group, Indicator, Stack } from "metabase/ui";
import type {
  ExplorationId,
  ExplorationPageNodeId,
  HydratedExplorationExploreFilter,
} from "metabase-types/api";

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
        dispatch(push(nextCommentsUrl));
      }}
    />
  ) : null;

  const filterPills =
    exploreFilters != null && exploreFilters.length > 0 ? (
      <Group gap="sm" wrap="wrap">
        {exploreFilters.map((filter, index) => (
          <FilterPill key={index} readOnly>
            {getExploreFilterPillLabel(filter)}
          </FilterPill>
        ))}
      </Group>
    ) : null;

  return (
    <Stack gap="sm" style={{ flexShrink: 0 }}>
      <Group h="2rem" justify="space-between" wrap="nowrap" miw={0}>
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
              {commentsButton}
            </Indicator>
          ) : (
            commentsButton
          )}
        </Group>
      </Group>
      {filterPills}
    </Stack>
  );
}

function getExploreFilterPillLabel(
  filter: HydratedExplorationExploreFilter,
): string {
  if (filter.dimension_name) {
    return `${filter.dimension_name}: ${filter.display_value}`;
  }
  return filter.display_value;
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
