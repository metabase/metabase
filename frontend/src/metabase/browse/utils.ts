import { t } from "ttag";
import _ from "underscore";

import {
  canonicalCollectionId,
  coerceCollectionId,
  isInstanceAnalyticsCollection,
  isRootCollection,
  isValidCollectionId,
} from "metabase/collections/utils";
import { entityForObject } from "metabase/lib/schema";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import type { IconName } from "metabase/ui";
import type {
  CollectionEssentials,
  SearchResult,
  CollectionId,
} from "metabase-types/api";

import { BROWSE_MODELS_LOCALSTORAGE_KEY } from "./constants";

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

    const sortValueFromPlugin =
      PLUGIN_CONTENT_VERIFICATION.sortCollectionsByVerification(
        collection1,
        collection2,
      );
    if (sortValueFromPlugin) {
      return sortValueFromPlugin;
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

export type AvailableModelFilters = Record<
  string,
  {
    predicate: (value: SearchResult) => boolean;
    activeByDefault: boolean;
  }
>;

export type ModelFilterControlsProps = {
  actualModelFilters: ActualModelFilters;
  handleModelFilterChange: (filterName: string, active: boolean) => void;
};

export const sortModels = (
  a: SearchResult,
  b: SearchResult,
  localeCode?: string,
) => {
  const sortValueFromPlugin =
    PLUGIN_CONTENT_VERIFICATION.sortModelsByVerification(a, b);
  if (sortValueFromPlugin) {
    return sortValueFromPlugin;
  }

  if (a.name && !b.name) {
    return -1;
  }
  if (!a.name && !b.name) {
    return 0;
  }
  if (!a.name && b.name) {
    return 1;
  }
  if (a.name && !b.name) {
    return -1;
  }
  if (!a.name && !b.name) {
    return 0;
  }
  const nameA = a.name.toLowerCase();
  const nameB = b.name.toLowerCase();
  return nameA.localeCompare(nameB, localeCode);
};

/** Mapping of filter names to true if the filter is active
 * or false if it is inactive */
export type ActualModelFilters = Record<string, boolean>;

export const filterModels = (
  unfilteredModels: SearchResult[],
  actualModelFilters: ActualModelFilters,
  availableModelFilters: AvailableModelFilters,
) => {
  return _.reduce(
    actualModelFilters,
    (acc, shouldFilterBeActive, filterName) =>
      shouldFilterBeActive
        ? acc.filter(availableModelFilters[filterName].predicate)
        : acc,
    unfilteredModels,
  );
};

type CollectionPrefs = Partial<Record<CollectionId, ModelVisibilityPrefs>>;

type ModelVisibilityPrefs = {
  expanded: boolean;
  showAll: boolean;
};

const isRecordWithCollectionIdKeys = (
  prefs: unknown,
): prefs is Record<CollectionId, any> =>
  !!prefs &&
  typeof prefs === "object" &&
  !Array.isArray(prefs) &&
  Object.keys(prefs).every(isValidCollectionId);

const isValidModelVisibilityPrefs = (
  value: unknown,
): value is ModelVisibilityPrefs =>
  typeof value === "object" &&
  value !== null &&
  Object.keys(value).includes("expanded") &&
  Object.keys(value).includes("showAll") &&
  Object.values(value).every(_.isBoolean);

const isValidCollectionPrefs = (prefs: unknown): prefs is CollectionPrefs =>
  isRecordWithCollectionIdKeys(prefs) &&
  Object.values(prefs).every(isValidModelVisibilityPrefs);

export const getCollectionViewPreferences = (): CollectionPrefs => {
  try {
    const collectionPrefs = JSON.parse(
      localStorage.getItem(BROWSE_MODELS_LOCALSTORAGE_KEY) ?? "{}",
    );

    if (isValidCollectionPrefs(collectionPrefs)) {
      return collectionPrefs;
    }

    return {};
  } catch (err) {
    console.error(err);
    return {};
  }
};

export const getIcon = (item: unknown): { name: IconName; color: string } => {
  const entity = entityForObject(item);
  return entity?.objectSelectors?.getIcon?.(item) || { name: "folder" };
};
