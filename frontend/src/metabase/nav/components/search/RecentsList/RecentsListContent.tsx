import { useMemo } from "react";
import { t } from "ttag";

import EmptyState from "metabase/common/components/EmptyState";
import { useListKeyboardNavigation } from "metabase/common/hooks/use-list-keyboard-navigation";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { getName } from "metabase/lib/name";
import { isSyncCompleted } from "metabase/lib/syncing";
import {
  EmptyStateContainer,
  SearchLoadingSpinner,
} from "metabase/nav/components/search/SearchResults";
import { PLUGIN_MODERATION } from "metabase/plugins";
import {
  ItemIcon,
  LoadingSection,
  ResultNameSection,
  ResultTitle,
  SearchResultContainer,
} from "metabase/search/components/SearchResult";
import { Group, Loader, Stack, Text, Title } from "metabase/ui";
import type { RecentItem } from "metabase-types/api";

import { getItemUrl, isItemActive } from "./util";

type RenderableComponent = {
  (props: {
    key?: string;
    isSelected?: boolean;
    onClick?: () => void;
  }): React.ReactElement;
  onClick?: () => void;
};

type RecentsListContentProps = {
  isLoading: boolean;
  results: RecentItem[];
  onClick?: (item: RecentItem) => void;
  headerChildren?: RenderableComponent[];
  footerChildren?: RenderableComponent[];
  onSelect?: () => void;
};

export const RecentsListContent = ({
  isLoading,
  results,
  onClick,
  headerChildren = [],
  footerChildren = [],
}: RecentsListContentProps) => {
  const list = useMemo(() => {
    return [...headerChildren, ...results, ...footerChildren];
  }, [results, headerChildren, footerChildren]);

  const { getRef, cursorIndex } = useListKeyboardNavigation<
    (typeof list)[number],
    HTMLButtonElement
  >({
    list,
    onEnter: (item) => {
      if (typeof item === "function") {
        item?.onClick?.();
      } else {
        onClick?.(item);
      }
    },
  });

  if (isLoading) {
    return <SearchLoadingSpinner />;
  }

  if (results.length === 0) {
    return (
      <Stack gap="md" px="sm" py="md">
        <Title order={4} px="sm">{t`Recently viewed`}</Title>
        <EmptyStateContainer>
          <EmptyState message={t`Nothing here`} icon="folder" />
        </EmptyStateContainer>
      </Stack>
    );
  }

  return (
    <>
      <Stack
        gap="sm"
        px="sm"
        pt="md"
        pb="sm"
        data-testid="recents-list-container"
      >
        <Title order={4} px="sm">{t`Recently viewed`}</Title>
        {headerChildren.map((C, index) => (
          <C
            key={`header-${index}`}
            isSelected={cursorIndex === index}
            onClick={C.onClick}
          />
        ))}
        <Stack gap={0}>
          {results.map((item, resultIndex) => {
            const index = resultIndex + headerChildren.length;
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
                <ResultNameSection justify="center" gap="xs">
                  <Group gap="xs" align="center" wrap="nowrap">
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
                  <Text size="sm" c="text-medium">
                    {getTranslatedEntityName(item.model)}
                  </Text>
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
      {footerChildren.map((C, index) => (
        <C
          key={`footer-${index}`}
          isSelected={cursorIndex === index}
          onClick={C.onClick}
        />
      ))}
    </>
  );
};

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
