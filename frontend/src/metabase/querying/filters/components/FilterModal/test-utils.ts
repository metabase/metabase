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
    searchText: "",
    setTab: jest.fn(),
    tab: null,
    version: 1,
    visibleItems: [],
    handleInput: jest.fn(),
    handleChange: jest.fn(),
    handleReset: jest.fn(),
    handleSubmit: jest.fn(),
    handleSearch: jest.fn(),
    ...props,
  };
};
