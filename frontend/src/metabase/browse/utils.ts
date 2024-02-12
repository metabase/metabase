import _ from "underscore";
import { t } from "ttag";
import {
  canonicalCollectionId,
  coerceCollectionId,
  isInstanceAnalyticsCollection,
  isRootCollection,
} from "metabase/collections/utils";
import type { CollectionEssentials, SearchResult } from "metabase-types/api";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";

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
  const sortGroupsByCollection = (a: SearchResult[], b: SearchResult[]) => {
    const collection1 = a[0].collection;
    const collection2 = b[0].collection;

    // Sort instance analytics collection to the end
    const collection1IsInstanceAnalyticsCollection =
      isInstanceAnalyticsCollection(collection1);
    const collection2IsInstanceAnalyticsCollection =
      isInstanceAnalyticsCollection(collection2);
    if (
      collection1IsInstanceAnalyticsCollection &&
      !collection2IsInstanceAnalyticsCollection
    ) {
      return 1;
    }
    if (
      collection2IsInstanceAnalyticsCollection &&
      !collection1IsInstanceAnalyticsCollection
    ) {
      return -1;
    }

    const sortValueProvidedByPlugin =
      PLUGIN_CONTENT_VERIFICATION.sortCollectionsForBrowseModels(
        collection1,
        collection2,
      );
    if (sortValueProvidedByPlugin === 1) {
      return 1;
    }
    if (sortValueProvidedByPlugin === -1) {
      return -1;
    }

    const name1 = getCollectionName(collection1);
    const name2 = getCollectionName(collection2);
    return name1.localeCompare(name2, locale);
  };
  groupsOfModels.sort(sortGroupsByCollection);
  return groupsOfModels;
};

export type BrowseTabId = "models" | "databases";

export const isValidBrowseTab = (value: unknown): value is BrowseTabId =>
  value === "models" || value === "databases";

type ArrayFilterPredicate<T> = Parameters<typeof Array.prototype.filter<T>>[0];

export type BrowseFilters = Record<
  string,
  {
    predicate: ArrayFilterPredicate<SearchResult>;
    active: boolean;
  }
>;

export type BrowseFilterControlsProps = {
  filters: BrowseFilters;
  toggleFilter: (filterName: string, active: boolean) => void;
};
