import type { Dispatch, SetStateAction } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  canonicalCollectionId,
  coerceCollectionId,
  isRootCollection,
} from "metabase/collections/utils";
import { entityForObject } from "metabase/lib/schema";
import type { IconName } from "metabase/ui";
import type {
  CollectionEssentials,
  ModelResult,
  RecentCollectionItem,
} from "metabase-types/api";

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

export type AvailableModelFilters = Record<
  string,
  {
    predicate: <T extends ModelResult | RecentCollectionItem>(
      value: T,
    ) => boolean;
    activeByDefault: boolean;
  }
>;

export type ModelFilterControlsProps = {
  actualModelFilters: ActualModelFilters;
  setActualModelFilters: Dispatch<SetStateAction<ActualModelFilters>>;
};

/** Mapping of filter names to true if the filter is active
 * or false if it is inactive */
export type ActualModelFilters = Record<string, boolean>;

export const filterModels = <T extends ModelResult[] | RecentCollectionItem[]>(
  unfilteredModels: T,
  actualModelFilters: ActualModelFilters,
  availableModelFilters: AvailableModelFilters,
): Array<T[number]> => {
  return _.reduce(
    actualModelFilters,
    (acc, shouldFilterBeActive, filterName) =>
      shouldFilterBeActive
        ? // https://devblogs.microsoft.com/typescript/announcing-typescript-5-2/#easier-method-usage-for-unions-of-arrays
          // @ts-expect-error This would be valid without a cast in TS 5.2+
          (acc.filter(availableModelFilters[filterName].predicate) as T)
        : acc,
    unfilteredModels,
  );
};

export const getIcon = (item: unknown): { name: IconName; color: string } => {
  const entity = entityForObject(item);
  return entity?.objectSelectors?.getIcon?.(item) || { name: "folder" };
};
