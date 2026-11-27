import { t } from "ttag";

import { skipToken, useGetCardQuery } from "metabase/api";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import { useGetCardTestQuery } from "metabase-enterprise/api";

type CardTestRouteParams = {
  cardId: string;
  testId: string;
};

export function useRouteCardTest() {
  const params = useParams<CardTestRouteParams>();
  const cardId = Urls.extractEntityId(params.cardId);
  const testId = Urls.extractEntityId(params.testId);
  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useGetCardQuery(cardId != null ? { id: cardId } : skipToken);
  const {
    data: test,
    isLoading: isLoadingTest,
    error: testError,
  } = useGetCardTestQuery(testId ?? skipToken);

  const isLoading = isLoadingCard || isLoadingTest;
  const isMissing =
    cardId == null ||
    testId == null ||
    (test != null && test.card_id !== cardId);
  const notFoundError = !isLoading && isMissing ? t`Not found.` : undefined;

  return {
    card,
    test: isMissing ? undefined : test,
    isLoading,
    error: cardError ?? testError ?? notFoundError,
  };
}
