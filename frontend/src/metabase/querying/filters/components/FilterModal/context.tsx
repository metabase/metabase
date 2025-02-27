import { createContext, useContext } from "react";

import type { FilterModalResult } from "../../hooks/use-filter-modal";

export type FilterModalContextType = FilterModalResult;

export const FilterModalContext = createContext<
  FilterModalContextType | undefined
>(undefined);

export const FilterModalProvider = FilterModalContext.Provider;

export const useFilterModalContext = () => {
  const context = useContext(FilterModalContext);

  if (!context) {
    throw new Error(
      "useFilterModalContext must be used within a FilterModalProvider",
    );
  }

  return context;
};
