import { t } from "ttag";

import { isRootCollection } from "metabase/collections/utils";
import SnippetCollections from "metabase/entities/snippet-collections";
import type { CollectionId } from "metabase-types/api";

function SnippetCollectionName({ id }: { id: CollectionId }) {
  if (isRootCollection({ id })) {
    return <span>{t`Top folder`}</span>;
  }
  if (!Number.isSafeInteger(id)) {
    return null;
  }
  return <SnippetCollections.Name id={id} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SnippetCollectionName;
