import type { Dispatch, SetStateAction } from "react";
import _ from "underscore";

import { entityForObject } from "metabase/lib/schema";
import type { IconName } from "metabase/ui";

import type { FilterableModel } from "./types";

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
