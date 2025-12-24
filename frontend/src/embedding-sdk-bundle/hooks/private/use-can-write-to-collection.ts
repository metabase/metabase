import type { SdkCollectionId } from "embedding-sdk-bundle/types/collection";
import { useGetCollectionQuery } from "metabase/api";

export const useCanWriteToCollection = (
  collectionId: SdkCollectionId | undefined,
  { skip = false }: { skip?: boolean } = {},
) => {
  const { data: collectionData, error } = useGetCollectionQuery(
    { id: collectionId ?? "root" },
    { skip },
  );

  return {
    canWrite: collectionData?.can_write ?? false,
    error,
  };
};
