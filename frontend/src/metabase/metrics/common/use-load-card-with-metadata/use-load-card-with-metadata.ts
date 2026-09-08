import type { CardId } from "metabase-types/api";
import {
  skipToken,
  useGetCardQuery,
  useGetCardQueryMetadataQuery,
} from "metabase/api";

export function useLoadCardWithMetadata(cardId: CardId | undefined) {
  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useGetCardQuery(cardId != null ? { id: cardId } : skipToken);
  const {
    data: metadata,
    isLoading: isLoadingMetadata,
    error: metadataError,
  } = useGetCardQueryMetadataQuery(cardId ?? skipToken);

  return {
    card,
    metadata,
    isLoading: isLoadingCard || isLoadingMetadata,
    error: cardError ?? metadataError,
  };
}
