import _ from "underscore";
import { t } from "ttag";
import {
  canonicalCollectionId,
  coerceCollectionId,
  isRootCollection,
} from "metabase/collections/utils";
import type { CollectionEssentials, SearchResult } from "metabase-types/api";

export const getCollectionName = (collection: CollectionEssentials) => {
  if (isRootCollection(collection)) {
    return t`Our analytics`;
  }
  return collection?.name || t`Untitled collection`;
};

/** The root collection's id might be null or 'root' in different contexts.
 * Use 'root' instead of null, for the sake of sorting */
export const getCollectionIdForSorting = (collection: CollectionEssentials) => {
  return coerceCollectionId(canonicalCollectionId(collection.id));
};

/** Group models by collection */
export const groupModels = (
  models: SearchResult[],
  locale: string | undefined,
) => {
  const groupedModels = _.groupBy(models, model =>
    getCollectionIdForSorting(model.collection),
  );
  const groupsOfModels: SearchResult[][] = Object.values(groupedModels);
  const sortFunction = (a: SearchResult[], b: SearchResult[]) => {
    const collection1 = a[0].collection;
    const collection2 = b[0].collection;

    const collection1AL = collection1.authority_level;
    const collection2AL = collection2.authority_level;
    if (collection1AL !== collection2AL) {
      if (!collection1AL) {
        return 1;
      }
      if (!collection2AL) {
        return -1;
      }
    }

    const name1 = getCollectionName(collection1);
    const name2 = getCollectionName(collection2);
    return name1.localeCompare(name2, locale);
  };
  groupsOfModels.sort(sortFunction);
  return groupsOfModels;
};

export type BrowseTabId = "models" | "databases";

export const isValidBrowseTab = (value: unknown): value is BrowseTabId =>
  value === "models" || value === "databases";
