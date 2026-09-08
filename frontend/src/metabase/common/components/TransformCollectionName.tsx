import { t } from "ttag";

import type { CollectionId } from "metabase-types/api";
import { skipToken, useGetCollectionQuery } from "metabase/api";
import { isRootCollection } from "metabase/common/collections/utils";

export function TransformCollectionName({ id }: { id: CollectionId }) {
  const { data: collection } = useGetCollectionQuery(
    !isRootCollection({ id }) && Number.isSafeInteger(id)
      ? // Unjustified type cast. FIXME
        { id: id as number, namespace: "transforms" }
      : skipToken,
  );

  if (isRootCollection({ id })) {
    return <span>{t`Transforms`}</span>;
  }

  if (!Number.isSafeInteger(id)) {
    return null;
  }

  return <span>{collection?.name ?? ""}</span>;
}
