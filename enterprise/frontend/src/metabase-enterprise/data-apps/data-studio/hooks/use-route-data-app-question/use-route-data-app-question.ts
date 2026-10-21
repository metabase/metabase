import { skipToken, useGetCardQuery } from "metabase/api";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";

import { useRouteDataApp } from "../use-route-data-app";

export function useRouteDataAppQuestion() {
  const params = useParams<{ cardId: string }>();
  const cardId = Urls.extractEntityId(params.cardId);
  const { app, isLoading: isLoadingApp, error: appError } = useRouteDataApp();
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
