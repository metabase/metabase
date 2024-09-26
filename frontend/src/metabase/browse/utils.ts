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
import type { CollectionEssentials } from "metabase-types/api";

import type { FilterableModel } from "./types";

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
    predicate: (value: FilterableModel) => boolean;
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

export const filterModels = <T extends FilterableModel>(
  unfilteredModels: T[] | undefined,
  actualModelFilters: ActualModelFilters,
  availableModelFilters: AvailableModelFilters,
): T[] => {
  return _.reduce(
    actualModelFilters,
    (acc, shouldFilterBeActive, filterName) =>
      shouldFilterBeActive
        ? acc.filter(availableModelFilters[filterName].predicate)
        : acc,
    unfilteredModels || [],
  );
};

export const getIcon = (item: unknown): { name: IconName; color: string } => {
  const entity = entityForObject(item);
  return entity?.objectSelectors?.getIcon?.(item) || { name: "folder" };
};
