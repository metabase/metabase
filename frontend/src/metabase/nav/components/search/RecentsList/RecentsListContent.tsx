import { t } from "ttag";

import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import EmptyState from "metabase/components/EmptyState";
import { useListKeyboardNavigation } from "metabase/hooks/use-list-keyboard-navigation";
import { isSyncCompleted } from "metabase/lib/syncing";
import type { WrappedRecentItem } from "metabase/nav/components/search/RecentsList";
import {
  SearchLoadingSpinner,
  EmptyStateContainer,
} from "metabase/nav/components/search/SearchResults";
import { PLUGIN_MODERATION } from "metabase/plugins";
import {
  ItemIcon,
  LoadingSection,
  ResultNameSection,
  ResultTitle,
  SearchResultContainer,
} from "metabase/search/components/SearchResult";
import { SearchResultLink } from "metabase/search/components/SearchResultLink";
import { Group, Loader, Stack, Title } from "metabase/ui";
import type { RecentItem } from "metabase-types/api";

import { getItemName, getItemUrl, isItemActive } from "./util";

type RecentsListContentProps = {
  isLoading: boolean;
  results: WrappedRecentItem[];
  onClick?: (item: RecentItem) => void;
};

export const RecentsListContent = ({
  isLoading,
  results,
  onClick,
}: RecentsListContentProps) => {
  const { getRef, cursorIndex } = useListKeyboardNavigation<
    WrappedRecentItem,
    HTMLButtonElement
  >({
    list: results,
    onEnter: (item: WrappedRecentItem) => onClick?.(item),
  });

  if (isLoading) {
    return <SearchLoadingSpinner />;
  }

  if (results.length === 0) {
    return (
      <Stack spacing="md" px="sm" py="md">
        <Title order={4} px="sm">{t`Recently viewed`}</Title>
        <EmptyStateContainer>
          <EmptyState message={t`Nothing here`} icon="folder" />
        </EmptyStateContainer>
      </Stack>
    );
  }

  return (
    <Stack
      spacing="sm"
      px="sm"
      pt="md"
      pb="sm"
      data-testid="recents-list-container"
    >
      <Title order={4} px="sm">{t`Recently viewed`}</Title>
      <Stack spacing={0}>
        {results.map((item, index) => {
          const isActive = isItemActive(item);

          return (
            <SearchResultContainer
              data-testid="recently-viewed-item"
              ref={getRef(item)}
              key={getItemKey(item)}
              component="button"
              onClick={() => onClick?.(item)}
              isActive={isActive}
              isSelected={cursorIndex === index}
              p="sm"
            >
              <ItemIcon active={isActive} item={item} type={item.model} />
              <ResultNameSection justify="center" spacing="xs">
                <Group spacing="xs" align="center" noWrap>
                  <ResultTitle
                    data-testid="recently-viewed-item-title"
                    truncate
                    href={onClick ? undefined : getItemUrl(item)}
                  >
                    {getItemName(item)}
                  </ResultTitle>
                  <PLUGIN_MODERATION.ModerationStatusIcon
                    status={getModeratedStatus(item)}
                    filled
                    size={14}
                  />
                </Group>
                <SearchResultLink>
                  {getTranslatedEntityName(item.model)}
                </SearchResultLink>
              </ResultNameSection>
              {isItemLoading(item) && (
                <LoadingSection px="xs">
                  <Loader />
                </LoadingSection>
              )}
            </SearchResultContainer>
          );
        })}
      </Stack>
    </Stack>
  );
};

const getItemKey = ({ model, model_id }: RecentItem) => {
  return `${model}:${model_id}`;
};

const getModeratedStatus = ({ model_object }: RecentItem) => {
  return model_object.moderated_status;
};

const isItemLoading = ({ model, model_object }: RecentItem) => {
  if (model !== "table") {
    return false;
  }
  return !isSyncCompleted(model_object);
};
