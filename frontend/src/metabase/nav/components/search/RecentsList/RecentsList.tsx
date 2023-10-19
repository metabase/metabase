import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import type { IconName } from "metabase/core/components/Icon";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { useListKeyboardNavigation } from "metabase/hooks/use-list-keyboard-navigation";
import * as Urls from "metabase/lib/urls";
import { SearchLoadingSpinner } from "metabase/nav/components/search/SearchResults/SearchResults";
import { SearchResultLink } from "metabase/search/components/SearchResultLink";
import type { RecentItem, UnrestrictedLinkEntity } from "metabase-types/api";
import { useRecentItemListQuery } from "metabase/common/hooks";
import RecentItems from "metabase/entities/recent-items";
import { useDispatch } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import {
  LoadingSection,
  ModerationIcon,
  ResultNameSection,
  ResultTitle,
  SearchResultContainer,
  ItemIcon,
} from "metabase/search/components/SearchResult";
import { Group, Loader, Stack, Title, Paper } from "metabase/ui";
import EmptyState from "metabase/components/EmptyState";
import { EmptyStateContainer } from "../SearchResults/SearchResults.styled";

type RecentsListProps = {
  onClick?: (elem: UnrestrictedLinkEntity) => void;
  className?: string;
};

export interface WrappedRecentItem extends RecentItem {
  getUrl: () => string;
  getIcon: () => {
    name: IconName;
    size?: number;
    width?: number;
    height?: number;
  };
}

export const RecentsList = ({ onClick, className }: RecentsListProps) => {
  const { data = [], isLoading: isRecentsListLoading } =
    useRecentItemListQuery();

  const wrappedResults: WrappedRecentItem[] = useMemo(
    () => data.map(item => RecentItems.wrapEntity(item)),
    [data],
  );

  const dispatch = useDispatch();

  const { getRef, cursorIndex } = useListKeyboardNavigation<
    RecentItem,
    HTMLButtonElement
  >({
    list: wrappedResults,
    onEnter: (item: RecentItem) => onChangeLocation(item),
  });

  const onChangeLocation = (item: RecentItem) => {
    const url = getItemUrl(item);
    if (url) {
      dispatch(push(url));
    }
  };

  const onContainerClick = (item: RecentItem) => {
    if (onClick) {
      onClick({
        ...item.model_object,
        model: item.model,
        name: getItemName(item),
        id: item.model_id,
      });
    } else {
      onChangeLocation(item);
    }
  };

  const getDisplayComponent = () => {
    if (isRecentsListLoading) {
      return <SearchLoadingSpinner />;
    }

    if (data.length === 0) {
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
      <Stack spacing="md" px="sm" py="md">
        <Title order={4} px="sm">{t`Recently viewed`}</Title>
        <Stack spacing={0}>
          {wrappedResults.map((item, index) => {
            const isActive = isItemActive(item);

            return (
              <SearchResultContainer
                ref={getRef(item)}
                key={getItemKey(item)}
                component="button"
                onClick={() => onContainerClick(item)}
                isActive={isActive}
                isSelected={cursorIndex === index}
                p="sm"
              >
                <ItemIcon active={isActive} item={item} type={item.model} />
                <ResultNameSection justify="center" spacing="xs">
                  <Group spacing="xs" align="center" noWrap>
                    <ResultTitle order={4} truncate>
                      {getItemName(item)}
                    </ResultTitle>
                    <ModerationIcon
                      status={getModeratedStatus(item)}
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

  return (
    <Paper withBorder className={className}>
      {getDisplayComponent()}
    </Paper>
  );
};

const getItemKey = ({ model, model_id }: RecentItem) => {
  return `${model}:${model_id}`;
};

const getItemName = ({ model_object }: RecentItem) => {
  return model_object.display_name || model_object.name;
};

const getModeratedStatus = ({ model_object }: RecentItem) => {
  return model_object.moderated_status;
};

const isItemActive = ({ model, model_object }: RecentItem) => {
  if (model !== "table") {
    return true;
  }
  return isSyncCompleted(model_object);
};

const isItemLoading = ({ model, model_object }: RecentItem) => {
  if (model !== "table") {
    return false;
  }
  return !isSyncCompleted(model_object);
};

const getItemUrl = (item: RecentItem) =>
  isItemActive(item) ? Urls.modelToUrl(item) : "";
