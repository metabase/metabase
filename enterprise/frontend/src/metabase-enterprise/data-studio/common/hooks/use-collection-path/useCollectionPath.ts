import { skipToken } from "metabase/api/api";
import { useGetCollectionQuery } from "metabase/api/collection";
import { isRootCollection } from "metabase/collections/utils";
import type { CollectionId } from "metabase-types/api/collection";

interface UseCollectionPathOptions {
  collectionId: CollectionId | null;
}

export const useCollectionPath = ({
  collectionId,
}: UseCollectionPathOptions) => {
  const { data: collection, isLoading: isLoadingPath } = useGetCollectionQuery(
    !collectionId ? skipToken : { id: collectionId },
    { skip: !collectionId },
  );

  const ancestors = collection?.effective_ancestors?.filter(
    (c) => !isRootCollection(c),
  );

  return {
    isLoadingPath,
    path: collection ? [...(ancestors || []), collection] : null,
  };
};
