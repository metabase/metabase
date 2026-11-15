import { useGetCollectionQuery } from "metabase/api/collection";
import { isRootCollection } from "metabase/common/collections/utils";
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
  const { currentData: collection, isFetching } = useGetCollectionQuery({
    id: collectionId ?? "root",
    namespace,
  });

  const ancestors =
    collection?.effective_ancestors?.filter((c) => !isRootCollection(c)) ?? [];

  return {
    isLoadingPath: collection == null && isFetching,
    path: collection ? [...ancestors, collection] : null,
  };
};
