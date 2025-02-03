import { useFilterModalContext } from "../context";

import { FilterTabContent } from "./FilterTabContent";
import { FilterTabEmptyState } from "./FilterTabEmptyState";

export const FilterModalBody = () => {
  const { visibleItems } = useFilterModalContext();

  if (visibleItems.length === 0) {
    return <FilterTabEmptyState />;
  }

  return <FilterTabContent />;
};
