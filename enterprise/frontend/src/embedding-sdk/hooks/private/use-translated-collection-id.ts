import { isValidId } from "embedding-sdk/lib/is-valid-collection-id";
import { getCollectionIdSlugFromReference } from "embedding-sdk/store/collections";
import type { SdkCollectionId } from "embedding-sdk/types/collection";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
import { useSelector } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

export const useTranslatedCollectionId = ({
  id: initialCollectionId,
}: {
  id?: SdkCollectionId;
}) => {
  const { id, isLoading, isError } = useValidatedEntityId({
    type: "collection",
    id: initialCollectionId,
  });

  const initId = !isLoading && (id ?? initialCollectionId);

  const translatedCollectionId = useSelector((state: State) =>
    initId ? getCollectionIdSlugFromReference(state, initId) : undefined,
  );

  return {
    id: isValidId(translatedCollectionId) ? translatedCollectionId : undefined,
    isLoading,
    isError,
  };
};
