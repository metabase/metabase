import React, { useState, useEffect, useCallback } from "react";
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

const PAGE_SIZE = 15;

interface QuestionListProps {
  enabledCards: Set<CardId>;
  onSelect: (card: Card, isChecked: boolean) => void;
  dashcard: any;
}

export const QuestionList = React.memo(function QuestionList({
  enabledCards,
  onSelect,
  dashcard,
}: QuestionListProps) {
  const [cards, setCards] = useState<Card[]>([]);

  const [{ error, loading }, loadCards] = useAsyncFn(
    async (last_cursor?: CardId) => {
      const cards = await CardApi.compatibleCards({
        cardId: dashcard.card_id,
        last_cursor,
        limit: PAGE_SIZE,
      });

      setCards(prev => [...prev, ...cards]);
    },
    [dashcard],
  );

  const [searchText, setSearchText] = useState("");
  const debouncedSearchText = useDebouncedValue(
    searchText,
    SEARCH_DEBOUNCE_DURATION,
  );

  useEffect(() => {
    setCards([]);
    loadCards();
  }, [debouncedSearchText, loadCards]);

  const handleSearchFocus = () => {
    MetabaseAnalytics.trackStructEvent(
      "Dashboard",
      "Edit Series Modal",
      "search",
    );
  };

  const handleLoadNext = useCallback(async () => {
    const lastCard = cards[cards.length - 1];
    loadCards(lastCard?.id);
  }, [cards, loadCards]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const hasQuestionsToShow = cards.length > 0;

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
                rowCount={cards.length + 1}
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
                  const isEnabled = enabledCards.has(card.id);

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
