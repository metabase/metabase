import React, { useState, useEffect, useCallback, useMemo } from "react";
import { t } from "ttag";
import { AutoSizer, List } from "react-virtualized";

import { useAsyncFn } from "react-use";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import EmptyState from "metabase/components/EmptyState";

import { CardApi } from "metabase/services";
import { Card, CardId } from "metabase-types/api";
import {
  LoadMoreButton,
  LoadMoreRow,
  SearchContainer,
  SearchInput,
  QuestionListContainer,
  EmptyStateContainer,
  QuestionListWrapper,
} from "./QuestionList.styled";
import { QuestionListItem } from "./QuestionListItem";

const PAGE_SIZE = 10;

interface QuestionListProps {
  enabledCards: Card[];
  onSelect: (card: Card, isChecked: boolean) => void;
  dashcard: any;
}

export const QuestionList = React.memo(function QuestionList({
  enabledCards,
  onSelect,
  dashcard,
}: QuestionListProps) {
  const enabledCardIds = useMemo(
    () => new Set(enabledCards.map(card => card.id)),
    [enabledCards],
  );

  const [hasMore, setHasMore] = useState(true);
  const [cards, setCards] = useState<Card[]>(enabledCards);
  const [searchText, setSearchText] = useState("");
  const debouncedSearchText = useDebouncedValue(
    searchText,
    SEARCH_DEBOUNCE_DURATION,
  );

  const [{ error, loading }, loadCards] = useAsyncFn(
    async (searchText: string, last_cursor?: CardId) => {
      const cards = await CardApi.compatibleCards({
        cardId: dashcard.card_id,
        last_cursor,
        limit: PAGE_SIZE,
        search: searchText.length > 0 ? searchText : null,
        exclude: Array.from(enabledCardIds.values()),
      });

      setCards(prev => [...prev, ...cards]);
      setHasMore(cards.length > 0);
    },
    [dashcard, debouncedSearchText],
  );

  useEffect(() => {
    setCards(debouncedSearchText.length > 0 ? [] : enabledCards);
    loadCards(debouncedSearchText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchText, loadCards]);

  const handleLoadNext = useCallback(async () => {
    const lastCard = cards[cards.length - 1];
    loadCards(debouncedSearchText, lastCard?.id);
  }, [cards, debouncedSearchText, loadCards]);

  const handleSearchFocus = () => {
    MetabaseAnalytics.trackStructEvent(
      "Dashboard",
      "Edit Series Modal",
      "search",
    );
  };

  const hasQuestionsToShow = cards.length > 0;
  const rowsCount = hasMore ? cards.length + 1 : cards.length;

  return (
    <>
      <SearchContainer>
        <SearchInput
          fullWidth
          value={searchText}
          leftIcon="search"
          placeholder={t`Search for a question`}
          onFocus={handleSearchFocus}
          onChange={e => setSearchText(e.target.value)}
        />
      </SearchContainer>
      <QuestionListWrapper
        className="flex flex-full overflow-auto"
        error={error}
        noBackground
      >
        <QuestionListContainer>
          <AutoSizer>
            {({ width, height }) => (
              <List
                overscanRowCount={0}
                width={width}
                height={height}
                rowCount={rowsCount}
                rowHeight={36}
                rowRenderer={({ index, key, style }) => {
                  const isLoadMoreRow = index === cards.length;

                  if (isLoadMoreRow) {
                    return (
                      <LoadMoreRow style={style}>
                        <LoadMoreButton
                          onClick={handleLoadNext}
                          disabled={loading}
                        >
                          {loading ? t`Loading` : t`Load more`}
                        </LoadMoreButton>
                      </LoadMoreRow>
                    );
                  }

                  const card = cards[index];
                  const isEnabled = enabledCardIds.has(card.id);

                  return (
                    <QuestionListItem
                      key={key}
                      card={card}
                      isEnabled={isEnabled}
                      style={style}
                      onChange={value => onSelect(card, value)}
                    />
                  );
                }}
              />
            )}
          </AutoSizer>
          {!hasQuestionsToShow && (
            <EmptyStateContainer>
              <EmptyState message={t`Nothing here`} icon="folder" />
            </EmptyStateContainer>
          )}
        </QuestionListContainer>
      </QuestionListWrapper>
    </>
  );
});
