import { t } from "ttag";

import { useGetCollectionQuery } from "metabase/api";
import { isRootCollection } from "metabase/collections/utils";
import type { CollectionId } from "metabase-types/api";

export function SnippetCollectionName({ id }: { id: CollectionId }) {
  if (isRootCollection({ id })) {
    return <span>{t`SQL snippets`}</span>;
  }
  if (!Number.isSafeInteger(id)) {
    return null;
  }
  return <SnippetCollectionNameLoader id={id} />;
}

function SnippetCollectionNameLoader({ id }: { id: CollectionId }) {
  const { data: collection } = useGetCollectionQuery({
    id,
    namespace: "snippets",
  });
  return <span>{collection?.name ?? ""}</span>;
}
