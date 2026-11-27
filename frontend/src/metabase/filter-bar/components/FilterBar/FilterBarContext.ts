import { createContext, useContext } from "react";

import type { FilterParts } from "../../types";

type FilterBarContextValue = {
  formatValues: (stage: number, parts: FilterParts) => string;
};

/*
 * Mostly for the components inside tiptap (node views): tiptap renders them
 * with its own props only, so they can't get anything from the Bar as props.
 */
export const FilterBarContext = createContext<FilterBarContextValue | null>(
  null,
);

export const useFilterBarContext = () => {
  const context = useContext(FilterBarContext);
  if (!context) {
    throw new Error("useFilterBarContext must be used within FilterBar");
  }
  return context;
};
