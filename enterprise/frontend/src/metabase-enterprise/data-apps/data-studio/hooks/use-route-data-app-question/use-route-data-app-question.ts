import { skipToken, useGetCardQuery } from "metabase/api";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import { useGetDataAppQuery } from "metabase-enterprise/api";

export function useRouteDataAppQuestion() {
  const params = useParams<{ name: string; cardId: string }>();
  const name = params.name ?? "";
  const cardId = Urls.extractEntityId(params.cardId);
  const {
    data: app,
    isLoading: isLoadingApp,
    error: appError,
  } = useGetDataAppQuery(name);
  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useGetCardQuery(cardId != null ? { id: cardId } : skipToken);

  return {
    app,
    card,
    isLoading: isLoadingApp || isLoadingCard,
    error: appError ?? cardError,
  };
}
