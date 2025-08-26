import { isRootCollection } from "metabase/collections/utils";
import type { Collection } from "metabase-types/api";

export const getCollectionList = (collection: Collection | undefined) => {
  const ancestors = collection?.effective_ancestors || [];
  const hasRoot = ancestors[0] && isRootCollection(ancestors[0]);
  const [_root, ...crumbsWithoutRoot] = ancestors;
  return hasRoot ? crumbsWithoutRoot : ancestors;
};
