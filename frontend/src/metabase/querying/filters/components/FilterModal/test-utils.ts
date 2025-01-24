import { createQuery } from "metabase-lib/test-helpers";

import type { FilterModalContextType } from "./context";

export const createMockFilterModalContext = (
  props?: Partial<FilterModalContextType>,
): FilterModalContextType => {
  return {
    query: createQuery(),
    version: 1,
    isChanged: false,
    groupItems: [],
    tab: null,
    setTab: jest.fn(),
    canRemoveFilters: false,
    searchText: "",
    isSearching: false,
    visibleItems: [],
    handleInput: jest.fn(),
    handleChange: jest.fn(),
    handleReset: jest.fn(),
    handleSubmit: jest.fn(),
    handleSearch: jest.fn(),
    ...props,
  };
};
