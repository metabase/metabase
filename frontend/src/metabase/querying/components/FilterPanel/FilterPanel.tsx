import { useMemo } from "react";

import type * as Lib from "metabase-lib";

import { FilterPanelRoot } from "./FilterPanel.styled";
import { FilterPanelPopover } from "./FilterPanelPopover";
import { dropStageIfEmpty, getFilterItems } from "./utils";

interface FilterPanelProps {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
}

export function FilterPanel({ query, onChange }: FilterPanelProps) {
  const items = useMemo(() => getFilterItems(query), [query]);

  const handleChange = (query: Lib.Query) => {
    onChange(dropStageIfEmpty(query));
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <FilterPanelRoot
      align="center"
      wrap="wrap"
      gap="sm"
      px="xl"
      py="sm"
      data-testid="qb-filters-panel"
    >
      {items.map(({ filter, stageIndex }, itemIndex) => (
        <FilterPanelPopover
          key={itemIndex}
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          onChange={handleChange}
        />
      ))}
    </FilterPanelRoot>
  );
}
