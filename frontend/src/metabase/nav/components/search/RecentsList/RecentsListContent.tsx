import { t } from "ttag";
import _ from "underscore";

import { EmptyState } from "metabase/common/components/EmptyState";
import {
  ItemIcon,
  LoadingSection,
  ResultNameSection,
  ResultTitle,
  SearchResultContainer,
} from "metabase/common/components/SearchResult";
import { SearchResultLink } from "metabase/common/components/SearchResultLink";
import { MeasuredSkeleton } from "metabase/common/components/Skeletons";
import { useListKeyboardNavigation } from "metabase/common/hooks/use-list-keyboard-navigation";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import {
  EmptyStateContainer,
  SearchResultsSkeleton,
} from "metabase/nav/components/search/SearchResults";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Group, Loader, Stack, Title } from "metabase/ui";
import { getName } from "metabase/utils/name";
import { isSyncCompleted } from "metabase/utils/syncing";
import type { RecentCollectionItem, RecentItem } from "metabase-types/api";

import { getItemUrl, isItemActive } from "./util";

const RECENTS_SKELETON_ROWS = 5;

// Typical names and models, so a first visit's skeleton has realistic line
// lengths. Later visits draw the list's shape as last shown.
const SAMPLE_RECENT_ITEMS: RecentItem[] = (
  [
    { name: "Revenue by product category", model: "card" },
    { name: "Sales performance overview", model: "dashboard" },
    { name: "Customer accounts", model: "dataset" },
    { name: "Weekly active users", model: "metric" },
    { name: "Orders by region and month", model: "card" },
  ] satisfies Pick<RecentCollectionItem, "name" | "model">[]
).map(({ name, model }, index) => ({
  id: -(index + 1),
  name,
  model,
  timestamp: "",
  can_write: false,
  parent_collection: { id: null, name: "" },
}));

type RecentsListContentProps = {
  isLoading: boolean;
  results: RecentItem[];
  onClick?: (item: RecentItem) => void;
};

export const RecentsListContent = ({
  isLoading,
  results,
  onClick,
}: RecentsListContentProps) => {
  const { getRef, cursorIndex } = useListKeyboardNavigation<
    RecentItem,
    HTMLDivElement
  >({
    list: results,
    onEnter: (item: RecentItem) => onClick?.(item),
  });

  if (!isLoading && results.length === 0) {
    return (
      <Stack gap="lg" px="sm" py="lg">
        <Title order={4} px="sm">{t`Recently viewed`}</Title>
        <EmptyStateContainer>
          <EmptyState message={t`Nothing here`} icon="folder" />
        </EmptyStateContainer>
      </Stack>
    );
  }

  return (
    <Stack
      gap="sm"
      px="sm"
      pt="lg"
      pb="sm"
      data-testid={isLoading ? undefined : "recents-list-container"}
    >
      <Title order={4} px="sm">{t`Recently viewed`}</Title>
      <MeasuredSkeleton
        loading={isLoading}
        id="recents-list"
        classic={<SearchResultsSkeleton rows={RECENTS_SKELETON_ROWS} />}
      >
        {isLoading ? (
          // a no-op click keeps the sample titles from linking anywhere
          <RecentItemRows items={SAMPLE_RECENT_ITEMS} onClick={_.noop} />
        ) : (
          <RecentItemRows
            items={results}
            cursorIndex={cursorIndex}
            getRef={getRef}
            onClick={onClick}
          />
        )}
      </MeasuredSkeleton>
    </Stack>
  );
};

type RecentItemRowsProps = {
  items: RecentItem[];
  cursorIndex?: number | null;
  getRef?: (
    item: RecentItem,
  ) => ((element: HTMLDivElement | null) => void) | undefined;
  onClick?: (item: RecentItem) => void;
};

const RecentItemRows = ({
  items,
  cursorIndex,
  getRef,
  onClick,
}: RecentItemRowsProps) => (
  <Stack gap={0}>
    {items.map((item, index) => {
      const isActive = isItemActive(item);

      return (
        <SearchResultContainer
          data-testid="recently-viewed-item"
          ref={getRef?.(item)}
          key={getItemKey(item)}
          onClick={() => onClick?.(item)}
          isActive={isActive}
          isSelected={cursorIndex === index}
        >
          <ItemIcon active={isActive} item={item} type={item.model} />
          <ResultNameSection justify="center" gap="xxs">
            <Group gap="xxs" align="center" wrap="nowrap">
              <ResultTitle
                data-testid="recently-viewed-item-title"
                truncate
                href={onClick ? undefined : getItemUrl(item)}
              >
                {getName(item)}
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
            <LoadingSection px="xxs">
              <Loader />
            </LoadingSection>
          )}
        </SearchResultContainer>
      );
    })}
  </Stack>
);

const getItemKey = ({ model, id }: RecentItem) => {
  return `${model}:${id}`;
};

const getModeratedStatus = (item: RecentItem) => {
  return item.model !== "table" && item.moderated_status;
};

const isItemLoading = (item: RecentItem) => {
  if (item.model !== "table") {
    return false;
  }
  if (!item.database) {
    return false;
  }
  return !isSyncCompleted(item.database);
};
