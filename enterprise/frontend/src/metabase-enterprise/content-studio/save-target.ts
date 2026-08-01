import { skipToken, useGetCollectionQuery } from "metabase/api";
import type { CollectionId } from "metabase-types/api";

/** @see PLUGIN_CONTENT_STUDIO.useSaveTargetCollectionId */
export function useSaveTargetCollectionId(
  collectionId: CollectionId | null | undefined,
): CollectionId | undefined {
  const { data: collection } = useGetCollectionQuery(
    typeof collectionId === "number" ? { id: collectionId } : skipToken,
  );

  return collection?.worktree_id != null ? collection.id : undefined;
}
