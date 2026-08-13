import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetCardQueryQuery,
} from "metabase/api";
import type { Card, Dataset } from "metabase-types/api";

export function useCardQueryData(
  card: Card,
  { skip = false }: { skip?: boolean } = {},
): { data: Dataset | undefined; isLoading: boolean } {
  const { data: cardData, isLoading: isLoadingCardData } = useGetCardQueryQuery(
    skip ? skipToken : card.id != null ? { cardId: card.id } : skipToken,
  );
  const { data: adhocData, isLoading: isLoadingAdhocData } =
    useGetAdhocQueryQuery(
      skip ? skipToken : card.id == null ? card.dataset_query : skipToken,
    );

  return {
    data: cardData || adhocData,
    isLoading: isLoadingCardData || isLoadingAdhocData,
  };
}
