import { useFilterModalContext } from "../context";

import { FilterTabContent } from "./FilterTabContent";
import { FilterTabEmptyState } from "./FilterTabEmptyState";

export const FilterModalBody = () => {
  const { groupItems } = useFilterModalContext();

  if (groupItems.length === 0) {
    return <FilterTabEmptyState />;
  }

  return <FilterTabContent />;
};
