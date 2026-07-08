import { useCallback } from "react";

import { useUpdateCardMutation } from "metabase/api";
import type { CardId } from "metabase-types/api";

export function useSetCollectionPreview() {
  const [updateCard] = useUpdateCardMutation();

  return useCallback(
    (id: CardId, collection_preview: boolean) =>
      updateCard({ id, collection_preview }),
    [updateCard],
  );
}
