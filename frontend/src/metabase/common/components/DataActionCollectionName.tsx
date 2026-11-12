import { t } from "ttag";

import { useGetCollectionQuery } from "metabase/api";
import { isRootCollection } from "metabase/common/collections/utils";
import type { CollectionId } from "metabase-types/api";

export function DataActionCollectionName({ id }: { id: CollectionId }) {
  if (isRootCollection({ id })) {
    return <span>{t`Data actions`}</span>;
  }
  if (!Number.isSafeInteger(id)) {
    return null;
  }
  return <DataActionCollectionNameLoader id={id} />;
}

function DataActionCollectionNameLoader({ id }: { id: CollectionId }) {
  const { data: collection } = useGetCollectionQuery({
    id,
    namespace: "data-actions",
  });
  return <span>{collection?.name ?? ""}</span>;
}
