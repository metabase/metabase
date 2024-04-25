import cx from "classnames";
import { memo, useState, useEffect, useCallback, useMemo } from "react";
import { useAsyncFn } from "react-use";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import CS from "metabase/css/core/index.css";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { CardApi } from "metabase/services";
import type {
  Card,
  CardId,
  QuestionDashboardCard,
  GetCompatibleCardsPayload,
} from "metabase-types/api";

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

const PAGE_SIZE = 50;

interface QuestionListProps {
  enabledCards: Card[];
  onSelect: (card: Card, isChecked: boolean) => void;
  dashcard: QuestionDashboardCard;
}

export const QuestionList = memo(function QuestionList({
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
      if (dashcard.card_id == null) {
        return;
      }

      const hasSearch = searchText.length > 0;

      const payload: GetCompatibleCardsPayload = {
        last_cursor,
        limit: PAGE_SIZE,
        exclude_ids: hasSearch ? [] : Array.from(enabledCardIds.values()),
      };

      if (hasSearch) {
        payload.query = searchText;
      }

      const cards = await CardApi.compatibleCards({
        ...payload,
        cardId: dashcard.card_id,
      });

      setCards(prev => [...prev, ...cards]);
      setHasMore(cards.length === PAGE_SIZE);
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
        className={cx(CS.flex, CS.flexFull, CS.overflowAuto)}
        error={error}
        noBackground
      >
        <QuestionListContainer>
          {hasQuestionsToShow && (
            <div>
              {cards.map(card => (
                <QuestionListItem
                  key={card.id}
                  card={card}
                  isEnabled={enabledCardIds.has(card.id)}
                  onChange={value => onSelect(card, value)}
                />
              ))}

              {hasMore && (
                <LoadMoreRow>
                  <LoadMoreButton onClick={handleLoadNext} disabled={loading}>
                    {loading ? t`Loading` : t`Load more`}
                  </LoadMoreButton>
                </LoadMoreRow>
              )}
            </div>
          )}

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
