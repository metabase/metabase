import cx from "classnames";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useAsyncFn } from "react-use";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { CardApi } from "metabase/services";
import { Box, Flex, Icon, TextInput } from "metabase/ui";
import type {
  Card,
  CardId,
  GetCompatibleCardsPayload,
  QuestionDashboardCard,
} from "metabase-types/api";

import S from "./QuestionList.module.css";
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

      //We want to ensure that we don't allow combining cards from other dashboards with this one
      const cards = (
        await CardApi.compatibleCards({
          ...payload,
          cardId: dashcard.card_id,
        })
      ).filter(
        (card: Card) =>
          card.dashboard_id === null ||
          card.dashboard_id === dashcard.dashboard_id,
      );

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

  const hasQuestionsToShow = cards.length > 0;

  return (
    <>
      <Flex align="center" className={S.SearchContainer}>
        <TextInput
          w="100%"
          value={searchText}
          radius={0}
          leftSection={<Icon className={S.SearchInputIcon} name="search" />}
          placeholder={t`Search for a question`}
          onChange={e => setSearchText(e.target.value)}
        />
      </Flex>
      <LoadingAndErrorWrapper
        className={cx(
          S.QuestionListWrapper,
          CS.flex,
          CS.flexFull,
          CS.overflowAuto,
        )}
        error={error}
        noBackground
      >
        <Box m={0} p={0} w="100%">
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
                <Box component="li" className={S.LoadMoreRow}>
                  <button
                    className={S.LoadMoreButton}
                    onClick={handleLoadNext}
                    disabled={loading}
                  >
                    {loading ? t`Loading` : t`Load more`}
                  </button>
                </Box>
              )}
            </div>
          )}

          {!hasQuestionsToShow && (
            <Flex align="center" justify="center" w="100%" h="100%">
              <EmptyState message={t`Nothing here`} icon="folder" />
            </Flex>
          )}
        </Box>
      </LoadingAndErrorWrapper>
    </>
  );
});
