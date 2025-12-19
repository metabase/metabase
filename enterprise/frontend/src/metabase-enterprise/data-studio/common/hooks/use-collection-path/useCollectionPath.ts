import { skipToken } from "metabase/api/api";
import { useGetCollectionQuery } from "metabase/api/collection";
import { isRootCollection } from "metabase/collections/utils";
import type {
  CollectionId,
  CollectionNamespace,
} from "metabase-types/api/collection";

interface UseCollectionPathOptions {
  collectionId: CollectionId | null;
  namespace?: CollectionNamespace;
}

export const useCollectionPath = ({
  collectionId,
  namespace,
}: UseCollectionPathOptions) => {
  const { currentData: collection, isLoading: isLoadingPath } =
    useGetCollectionQuery(
      collectionId == null ? skipToken : { id: collectionId, namespace },
    );

  const ancestors =
    collection?.effective_ancestors?.filter((c) => !isRootCollection(c)) ?? [];

  return {
    isLoadingPath,
    path: collection ? [...ancestors, collection] : null,
  };
};
