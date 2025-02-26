import { createQuery } from "metabase-lib/test-helpers";

import type { FilterModalContextType } from "./context";

export const createMockFilterModalContext = (
  props?: Partial<FilterModalContextType>,
): FilterModalContextType => {
  return {
    canRemoveFilters: false,
    groupItems: [],
    isChanged: false,
    isSearching: false,
    query: createQuery(),
    remountKey: 1,
    searchText: "",
    tab: null,
    visibleItems: [],
    onInput: jest.fn(),
    onQueryChange: jest.fn(),
    onReset: jest.fn(),
    onSubmit: jest.fn(),
    onSearchTextChange: jest.fn(),
    onTabChange: jest.fn(),
    ...props,
  };
};
