import { t } from "ttag";

import { isRootCollection } from "metabase/collections/utils";
import { SnippetCollections } from "metabase/entities/snippet-collections";
import type { CollectionId } from "metabase-types/api";

export function SnippetCollectionName({ id }: { id: CollectionId }) {
  if (isRootCollection({ id })) {
    return <span>{t`SQL snippets`}</span>;
  }
  if (!Number.isSafeInteger(id)) {
    return null;
  }
  return <SnippetCollections.Name id={id} />;
}
