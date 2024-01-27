import _ from "underscore";
import { t } from "ttag";
import { isRootCollection } from "metabase/collections/utils";
import type { CollectionEssentials, SearchResult } from "metabase-types/api";

export const getCollectionName = (collection: CollectionEssentials) => {
  if (isRootCollection(collection)) {
    return t`Our analytics`;
  }
  return collection?.name || t`Untitled collection`;
};

/** Group models by collection */
export const groupModels = (
  models: SearchResult[],
  locale: string | undefined,
) => {
  const groupedModels = Object.values(
    _.groupBy(models, model => model.collection.id),
  ).sort((a, b) =>
    getCollectionName(a[0].collection).localeCompare(
      getCollectionName(b[0].collection),
      locale,
    ),
  );
  return groupedModels;
};
