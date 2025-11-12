import {
  skipToken,
  useGetCardQuery,
  useGetCardQueryMetadataQuery,
} from "metabase/api";
import { PLUGIN_SEMANTIC_LAYER } from "metabase/plugins";
import type { CardId } from "metabase-types/api";

export function useLoadCardWithMetadata(cardId: CardId | undefined) {
  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useGetCardQuery(
    cardId != null
      ? {
          id: cardId,
          include_editable_semantic_layer: PLUGIN_SEMANTIC_LAYER.isEnabled
            ? true
            : undefined,
        }
      : skipToken,
  );
  const { isLoading: isLoadingMetadata, error: metadataError } =
    useGetCardQueryMetadataQuery(cardId ?? skipToken);

  return {
    card,
    isLoading: isLoadingCard || isLoadingMetadata,
    error: cardError ?? metadataError,
  };
}
