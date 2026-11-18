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

  return {
    card,
    test,
    isLoading: isLoadingCard || isLoadingTest,
    error: cardError ?? testError,
  };
}
